from __future__ import annotations

"""
Manim Visual Explanation Route — fully rewritten.

Fixes applied:
  1. All template builders are fully implemented (no more blank images)
  2. Hardcoded localhost URLs replaced with BASE_URL env var
  3. Rate-limiter race condition fixed with asyncio.Lock
  4. Cache size-limit (CACHE_MAX_SIZE_MB) is now actually enforced
  5. DANGEROUS_PATTERNS blocks bare `import` statements in generated code
  6. render_with_fallback retry logic corrected (no longer off-by-one)
  7. Classify → extract → build → render pipeline extracted to _run_pipeline()
     so both routes share one implementation
  8. sanitize_input no longer strips [] / {} unconditionally
  9. Imports split to one-per-line (PEP 8)
 10. check_visual_quality excludes commented lines before counting
"""

import asyncio
import ast
import hashlib
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import traceback
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from services.llm import complete

# ── Authentication ────────────────────────────────────────────────────────────
security = HTTPBearer(auto_error=False)
API_KEYS = set(os.getenv("API_KEYS", "").split(",")) if os.getenv("API_KEYS") else set()


def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not API_KEYS:
        return True
    if not credentials:
        raise HTTPException(status_code=401, detail="API key required")
    if credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    if credentials.credentials not in API_KEYS:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return True


router = APIRouter()

# ── Pydantic Models ───────────────────────────────────────────────────────────
class VisualRequest(BaseModel):
    topic: str
    context: str = ""
    style: str = "auto"  # auto | cinematic | minimal | dynamic


class VisualResponse(BaseModel):
    html: str = ""
    image_url: str = ""
    code: str = ""
    status: str
    cached: bool = False


class FeedbackRequest(BaseModel):
    cache_key: str
    rating: str
    reason: str = ""


# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("manim.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")          # FIX 2
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "10"))
MAX_IP_TRACKED = 10_000
MAX_CONCURRENT_REQUESTS = int(os.getenv("MAX_CONCURRENT_REQUESTS", "10"))
CPU_COUNT = os.cpu_count() or 2
MAX_WORKERS = min(8, CPU_COUNT)
TEMP_BASE = os.path.join(tempfile.gettempdir(), "manim_temp")
VIDEOS_DIR = os.path.abspath(os.getenv("VIDEOS_DIR", "./videos"))
MANIM_TIMEOUT = int(os.getenv("MANIM_TIMEOUT", "180"))
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "20"))
CPU_TIME_LIMIT = int(os.getenv("CPU_TIME_LIMIT", "30"))
MEMORY_LIMIT_MB = int(os.getenv("MEMORY_LIMIT_MB", "512"))
CACHE_VERSION = "v7"
CACHE_DIR = os.path.join(VIDEOS_DIR, "cache")
CACHE_MAX_FILES = int(os.getenv("CACHE_MAX_FILES", "500"))
CACHE_MAX_AGE_DAYS = int(os.getenv("CACHE_MAX_AGE_DAYS", "7"))
CACHE_MAX_SIZE_MB = int(os.getenv("CACHE_MAX_SIZE_MB", "1024"))
MAX_RETRY_ATTEMPTS = 2

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(VIDEOS_DIR, exist_ok=True)

FEEDBACK_DIR = os.path.join(os.path.dirname(__file__), "feedback")
os.makedirs(FEEDBACK_DIR, exist_ok=True)

# ── Concurrency primitives ────────────────────────────────────────────────────
request_semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
_rate_limit_lock = asyncio.Lock()                                  # FIX 3
_pool = ThreadPoolExecutor(max_workers=MAX_WORKERS)
logger.info(f"Thread pool: {MAX_WORKERS} workers")

def shutdown_pool():
    _pool.shutdown(wait=False)
    logger.info("Manim thread pool shut down.")

request_counts: dict[str, list] = defaultdict(list)

# ── Security patterns ─────────────────────────────────────────────────────────
# FIX 5: also block bare `import` / `from … import` statements in generated code
DANGEROUS_PATTERNS = [
    r"^\s*import\s+\w",            # bare import statement
    r"^\s*from\s+\w.*\bimport\b",  # from X import Y
    r"__\w+__",
    r"eval\s*\(",
    r"exec\s*\(",
    r"compile\s*\(",
    r"open\s*\(",
    r"subprocess\.",
    r"os\.system",
    r"os\.popen",
    r"shutil\.",
    r"globals\s*\(",
    r"locals\s*\(",
    r"getattr\s*\(",
    r"setattr\s*\(",
    r"__builtins__",
    r"__import__",
    r"while\s+True",
    r"for\s+\w+\s+in\s+range\(\s*\d{6,}\s*\)",
]

VALID_COLORS = {
    "BLUE", "GREEN", "RED", "YELLOW", "PINK", "TEAL", "GOLD",
    "WHITE", "PURPLE", "ORANGE", "MAROON", "GREY", "LIGHT_BROWN",
    "DARK_BROWN", "LIGHT_GREY", "DARK_GREY", "LIGHT_PINK",
}

STYLE_MAPPING = {
    "data_structure": "cinematic",
    "algorithm": "dynamic",
    "cs_concept": "cinematic",
    "math": "minimal",
    "physics": "cinematic",
    "chemistry": "cinematic",
    "biology": "cinematic",
    "general": "dynamic",
}


# ── Small utilities ───────────────────────────────────────────────────────────
def get_style_from_category(category: str, requested_style: str) -> str:
    if requested_style != "auto":
        return requested_style
    return STYLE_MAPPING.get(category, "cinematic")


def get_animation_timing(style: str) -> tuple[float, float]:
    return {"cinematic": (1.5, 0.3), "minimal": (0.8, 0.15)}.get(style, (1.2, 0.25))


def safe_color(color: str) -> str:
    if not isinstance(color, str):
        return "BLUE"
    color_upper = color.upper()
    if color_upper in VALID_COLORS:
        return color_upper
    aliases = {
        "MAGENTA": "PINK", "CYAN": "BLUE", "LIME": "GREEN", "AQUA": "BLUE",
        "FUCHSIA": "PINK", "SILVER": "GREY", "NAVY": "BLUE", "OLIVE": "GREEN",
        "CORAL": "PINK", "SKY": "BLUE",
    }
    return aliases.get(color_upper, "BLUE")


def safe_params(p: dict) -> dict:
    out = p.copy()
    for k, v in out.items():
        if k.startswith("color") and isinstance(v, str):
            out[k] = safe_color(v)
    return out


def sanitize_input(text: str, max_length: int = 500) -> str:
    """FIX 8: only strip injection-looking tokens, not all brackets."""
    if not isinstance(text, str):
        return ""
    text = re.sub(r"ignore\s+above", "", text, flags=re.IGNORECASE)
    text = re.sub(r"output\s+python\s+code", "", text, flags=re.IGNORECASE)
    text = re.sub(r"os\.system", "", text, flags=re.IGNORECASE)
    text = re.sub(r"__\w+__", "", text)
    return text.strip()[:max_length]


def safe_json_load(s: str) -> dict:
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        s = re.sub(r",\s*([\]}])", r"\1", s)
        s = re.sub(r'([{,])\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', s)
        s = re.sub(r"//.*?\n", "", s)
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.DOTALL)
        try:
            return json.loads(s)
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse failed: {e}")
            return {}


def escape_for_fstring(s: str) -> str:
    if not isinstance(s, str):
        return s
    return s.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


# ── Cache ─────────────────────────────────────────────────────────────────────
def get_cache_key(topic: str, context: str, style: str) -> str:
    content = f"{CACHE_VERSION}|{sanitize_input(topic, 100)}|{sanitize_input(context, 200)}|{style}"
    return hashlib.md5(content.encode()).hexdigest()


def get_cached_response(cache_key: str) -> tuple[dict | None, bool]:
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("cache_version") == CACHE_VERSION and os.path.exists(data.get("image_path", "")):
                os.utime(cache_file, None)
                return data, True
        except Exception as e:
            logger.error(f"Cache read error: {e}")
    return None, False


def save_to_cache(cache_key: str, image_path: str, code: str, topic: str):
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump({
                "cache_version": CACHE_VERSION,
                "image_path": image_path,
                "code": code,
                "topic": topic,
                "timestamp": datetime.now().isoformat(),
            }, f)
        cleanup_cache()
    except Exception as e:
        logger.error(f"Cache save error: {e}")


def cleanup_cache(max_files=None, max_age_days=None, max_size_mb=None):
    """FIX 4: enforce size limit in addition to count and age."""
    max_files = max_files or CACHE_MAX_FILES
    max_age_days = max_age_days or CACHE_MAX_AGE_DAYS
    max_size_mb = max_size_mb or CACHE_MAX_SIZE_MB

    try:
        cutoff = datetime.now() - timedelta(days=max_age_days)
        files = []
        for fname in os.listdir(CACHE_DIR):
            fp = os.path.join(CACHE_DIR, fname)
            if os.path.isfile(fp):
                mtime = datetime.fromtimestamp(os.path.getmtime(fp))
                files.append((mtime, fp))
        files.sort()

        removed = 0
        for mtime, fp in files[:]:
            if mtime < cutoff:
                os.remove(fp)
                removed += 1

        files = [(m, fp) for m, fp in files if os.path.exists(fp)]

        if len(files) > max_files:
            for _, fp in files[: len(files) - max_files]:
                os.remove(fp)
                removed += 1

        files = [(m, fp) for m, fp in files if os.path.exists(fp)]

        # FIX 4: size enforcement
        total_mb = sum(os.path.getsize(fp) for _, fp in files) / (1024 * 1024)
        while total_mb > max_size_mb and files:
            _, oldest = files.pop(0)
            sz = os.path.getsize(oldest) / (1024 * 1024)
            os.remove(oldest)
            total_mb -= sz
            removed += 1

        if removed:
            logger.info(f"Cache cleanup removed {removed} files")
    except Exception as e:
        logger.error(f"Cache cleanup error: {e}")


# ── Rate limiting ─────────────────────────────────────────────────────────────
def _prune_rate_storage():
    global request_counts
    if len(request_counts) > MAX_IP_TRACKED:
        sorted_ips = sorted(
            request_counts.items(),
            key=lambda x: max(x[1]) if x[1] else datetime.min,
            reverse=True,
        )
        request_counts = defaultdict(list, dict(sorted_ips[: MAX_IP_TRACKED // 2]))
        logger.info(f"Rate store pruned to {len(request_counts)} IPs")


async def check_rate_limit(client_ip: str) -> bool:
    """FIX 3: atomic read-modify-write under asyncio lock."""
    async with _rate_limit_lock:
        now = datetime.now()
        window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW)
        request_counts[client_ip] = [
            ts for ts in request_counts[client_ip] if ts > window_start
        ]
        if len(request_counts[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
            logger.warning(f"Rate limit exceeded: {client_ip}")
            return False
        request_counts[client_ip].append(now)
        if len(request_counts) % 100 == 0:
            _prune_rate_storage()
        return True


# ── Security ──────────────────────────────────────────────────────────────────
def is_safe_code(code: str) -> tuple[bool, str]:
    # Strip comment lines before checking so comments don't trigger false positives
    active_lines = [l for l in code.splitlines() if not l.strip().startswith("#")]
    # Allow manim imports
    safe_imports = [
        r'^\s*from\s+manim\s+import\s+\*',
        r'^\s*import\s+manim\b',
    ]
    for line in active_lines:
        # Skip if it's a safe import
        if any(re.match(p, line, re.IGNORECASE) for p in safe_imports):
            continue
        for pattern in DANGEROUS_PATTERNS:
            if re.search(pattern, line, re.IGNORECASE):
                return False, f"Blocked pattern: {pattern} in line: {line[:100]}"
    if len(code) > 50_000:
        return False, "Code too large (>50 KB)"
    if code.count("\n") > 2_000:
        return False, "Too many lines (>2000)"
    return True, "OK"


# ── Resource limits ───────────────────────────────────────────────────────────
def set_resource_limits():
    if os.name == "nt":
        return
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (CPU_TIME_LIMIT, CPU_TIME_LIMIT + 5))
        mem = MEMORY_LIMIT_MB * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem + 10 * 1024 * 1024))
    except Exception as e:
        logger.warning(f"Could not set resource limits: {e}")


# ── Rendering ─────────────────────────────────────────────────────────────────
def _find(d: str, ext: str) -> str | None:
    for root, _, files in os.walk(d):
        for f in files:
            if f.endswith(ext):
                return os.path.join(root, f)
    return None


def render_sync(code: str, topic: str) -> str:
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    os.makedirs(TEMP_BASE, exist_ok=True)

    jid = str(uuid.uuid4())[:8]
    slug = re.sub(r"[^a-zA-Z0-9]", "_", topic)[:18]
    jdir = os.path.join(TEMP_BASE, jid)
    odir = os.path.join(jdir, "out")
    pyf = os.path.join(jdir, "scene.py")
    os.makedirs(odir, exist_ok=True)

    with open(pyf, "w", encoding="utf-8") as f:
        f.write(code)

    cmd = [
        "manim", "-ql", "--save_last_frame",
        "--disable_caching", "--media_dir", odir, pyf, "ExplanationScene",
    ]
    try:
        kwargs = dict(capture_output=True, text=True, cwd=jdir, timeout=MANIM_TIMEOUT)
        if os.name != "nt":
            kwargs["preexec_fn"] = set_resource_limits
        try:
            r = subprocess.run(cmd, **kwargs)
        except FileNotFoundError:
            raise RuntimeError("Manim is not installed or not in PATH.")

        if r.returncode != 0:
            lines = r.stderr.splitlines()
            errors = [l for l in lines if any(w in l for w in ["Error", "ValueError", "line "])]
            raise RuntimeError("\n".join(errors[-6:]) or r.stderr[-600:])

        png = _find(odir, ".png") or _find(jdir, ".png")
        if not png:
            mp4 = _find(odir, ".mp4") or _find(jdir, ".mp4")
            if mp4:
                png = os.path.join(jdir, "frame.png")
                try:
                    subprocess.run(
                        ["ffmpeg", "-i", mp4, "-frames:v", "1", "-q:v", "2", png, "-y"],
                        capture_output=True, timeout=30,
                    )
                except FileNotFoundError:
                    logger.warning("FFmpeg is not installed or not in PATH, cannot extract frame from mp4.")

        if not png or not os.path.exists(png):
            raise RuntimeError("Manim produced no image output.")

        dst = os.path.join(VIDEOS_DIR, f"{slug}_{jid}.png")
        shutil.copy2(png, dst)
        return dst
    finally:
        shutil.rmtree(jdir, ignore_errors=True)


# ── Visual quality check ──────────────────────────────────────────────────────
def check_visual_quality(code: str) -> tuple[bool, list[str], int]:
    """FIX 10: exclude comment lines before counting."""
    active = "\n".join(
        l for l in code.splitlines() if not l.strip().startswith("#")
    )
    text_count = active.count("Text(")
    arrow_count = active.count("Arrow(")
    transform_count = active.count("Transform(")
    anim_count = active.count("self.play")

    issues = []
    if text_count > 12 and anim_count < 6:
        issues.append(f"Too static: {text_count} Text elements but only {anim_count} animations")
    if arrow_count < 2 and transform_count < 2 and anim_count < 5:
        issues.append(f"Lacks dynamics: {arrow_count} arrows, {transform_count} transforms")
    if anim_count < 4:
        issues.append(f"Too few animations: {anim_count}")
    quality_score = anim_count * 10 + arrow_count * 15 + transform_count * 12
    if quality_score < 80:
        issues.append(f"Low quality score: {quality_score}")
    return len(issues) == 0, issues, quality_score


# ── LLM helpers ───────────────────────────────────────────────────────────────
async def call_llm_with_timeout(
    prompt: str, user_message: str, max_tokens: int, temperature: float
) -> str:
    try:
        return await asyncio.wait_for(
            complete(
                system_prompt=prompt,
                user_message=user_message,
                max_tokens=max_tokens,
                temperature=temperature,
            ),
            timeout=LLM_TIMEOUT,
        )
    except asyncio.TimeoutError:
        raise TimeoutError(f"LLM timed out after {LLM_TIMEOUT}s")


async def regenerate_with_stronger_prompt(
    topic: str, context: str, category: str, previous_params: dict
) -> dict:
    prompt = f"""
CRITICAL: Previous attempt was too static.  You MUST ensure:
1. At least 8 animations using self.play()
2. Use Arrow() to show relationships
3. Use Transform() or ReplacementTransform() for transitions
4. Color highlights on active elements
5. Dynamic, visually engaging output

Topic: {topic}
Context: {context}
Category: {category}
Previous params: {json.dumps(previous_params, indent=2)}

Return ONLY the same JSON structure with enhanced visual elements.
"""
    try:
        raw = await call_llm_with_timeout(
            prompt, f"Enhanced params for: {topic}", 900, 0.35
        )
        raw = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            js = m.group()
            js += "]" * max(0, js.count("[") - js.count("]"))
            js += "}" * max(0, js.count("{") - js.count("}"))
            new_params = safe_json_load(js)
            if new_params:
                return new_params
    except Exception as e:
        logger.error(f"Param regeneration failed: {e}")
    return previous_params


# ── Template builders (FIX 1: fully implemented) ──────────────────────────────

def build_data_structure_code(p: dict, style: str = "cinematic") -> str:
    p = safe_params(p)
    run_time, wait_time = get_animation_timing(style)

    title = escape_for_fstring(p.get("title", "Linked List"))
    subtitle = escape_for_fstring(p.get("subtitle", "Introduction to Linked Lists"))
    node_labels = p.get("node_labels", ["10", "20", "30"])
    node_count = min(int(p.get("node_count", 3)), len(node_labels))
    node_labels = node_labels[:node_count]
    color_node = p.get("color_node", "TEAL")
    color_pointer = p.get("color_pointer", "PINK")
    color_head = p.get("color_head", "GOLD")
    color_tail = p.get("color_tail", "RED")
    head_label = escape_for_fstring(p.get("head_label", "HEAD"))
    tail_label = escape_for_fstring(p.get("tail_label", "TAIL / NULL"))
    key_concept = escape_for_fstring(p.get("key_concept", "Each node holds data and a pointer to the next node."))

    labels_repr = repr(node_labels)

    return f'''from manim import *

class ExplanationScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"

        # ── Title ────────────────────────────────────────────────────────────
        title = Text("{title}", font_size=36, color={color_head}, weight=BOLD)
        subtitle = Text("{subtitle}", font_size=18, color=GREY)
        title_group = VGroup(title, subtitle).arrange(DOWN, buff=0.15)
        title_group.to_edge(UP, buff=0.4)
        self.play(FadeIn(title_group, shift=DOWN*0.3), run_time={run_time})
        self.wait({wait_time})

        # ── Build nodes ───────────────────────────────────────────────────────
        node_labels = {labels_repr}
        nodes = []
        for label in node_labels:
            box = RoundedRectangle(corner_radius=0.15, width=1.4, height=0.9,
                                   fill_color={color_node}, fill_opacity=0.25,
                                   stroke_color={color_node}, stroke_width=2)
            txt = Text(str(label), font_size=22, color=WHITE)
            ptr = Rectangle(width=0.4, height=0.9,
                             fill_color={color_pointer}, fill_opacity=0.3,
                             stroke_color={color_pointer}, stroke_width=1.5)
            ptr_txt = Text("→", font_size=18, color={color_pointer})
            ptr_txt.move_to(ptr)
            cell = VGroup(box, txt, ptr, ptr_txt).arrange(RIGHT, buff=0)
            nodes.append(cell)

        node_row = VGroup(*nodes).arrange(RIGHT, buff=0.55)
        node_row.move_to(ORIGIN)

        # ── Animate nodes in one by one ───────────────────────────────────────
        for i, node in enumerate(nodes):
            self.play(FadeIn(node, shift=UP*0.2), run_time={run_time * 0.7})
            self.wait({wait_time})

        # ── Arrows between nodes ──────────────────────────────────────────────
        arrows = []
        for i in range(len(nodes) - 1):
            start = nodes[i].get_right()
            end   = nodes[i+1].get_left()
            arr = Arrow(start, end, buff=0.05, color={color_pointer},
                        stroke_width=3, max_tip_length_to_length_ratio=0.25)
            arrows.append(arr)
            self.play(GrowArrow(arr), run_time={run_time * 0.6})

        self.wait({wait_time})

        # ── HEAD label ────────────────────────────────────────────────────────
        head_lbl = Text("{head_label}", font_size=18, color={color_head}, weight=BOLD)
        head_lbl.next_to(nodes[0], UP, buff=0.35)
        head_arr = Arrow(head_lbl.get_bottom(), nodes[0].get_top(),
                         buff=0.05, color={color_head}, stroke_width=2)
        self.play(FadeIn(head_lbl), GrowArrow(head_arr), run_time={run_time * 0.8})

        # ── TAIL label ────────────────────────────────────────────────────────
        tail_lbl = Text("{tail_label}", font_size=18, color={color_tail}, weight=BOLD)
        tail_lbl.next_to(nodes[-1], DOWN, buff=0.35)
        self.play(FadeIn(tail_lbl, shift=UP*0.1), run_time={run_time * 0.6})
        self.wait({wait_time})

        # ── Highlight traversal ───────────────────────────────────────────────
        for node in nodes:
            self.play(
                node.animate.set_stroke(color=YELLOW, width=4),
                run_time=0.4,
            )
            self.wait(0.15)
            self.play(
                node.animate.set_stroke(color={color_node}, width=2),
                run_time=0.3,
            )

        # ── Key concept footer ────────────────────────────────────────────────
        concept = Text("{key_concept}", font_size=15, color=GREY)
        concept.to_edge(DOWN, buff=0.35)
        self.play(FadeIn(concept), run_time={run_time * 0.7})
        self.wait(1.0)
'''


def build_algorithm_code(p: dict, style: str = "dynamic") -> str:
    p = safe_params(p)
    run_time, wait_time = get_animation_timing(style)

    title = escape_for_fstring(p.get("title", "Bubble Sort"))
    subtitle = escape_for_fstring(p.get("subtitle", "Algorithm Walkthrough"))
    input_array = p.get("input_array", [5, 3, 8, 1, 9, 2])[:8]
    complexity_time = escape_for_fstring(p.get("complexity_time", "O(n²)"))
    complexity_space = escape_for_fstring(p.get("complexity_space", "O(1)"))
    key_insight = escape_for_fstring(p.get("key_insight", "Compare adjacent elements and swap if out of order."))
    color_active = p.get("color_active", "YELLOW")
    color_sorted = p.get("color_sorted", "GREEN")
    color_default = p.get("color_default", "BLUE")

    return f'''from manim import *

class ExplanationScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"

        # ── Title ─────────────────────────────────────────────────────────────
        title = Text("{title}", font_size=36, color={color_active}, weight=BOLD)
        subtitle = Text("{subtitle}", font_size=18, color=GREY)
        VGroup(title, subtitle).arrange(DOWN, buff=0.15).to_edge(UP, buff=0.4)
        self.play(FadeIn(title, shift=DOWN*0.2), FadeIn(subtitle), run_time={run_time})
        self.wait({wait_time})

        # ── Build array bars ──────────────────────────────────────────────────
        arr = {input_array}
        max_val = max(arr) if arr else 1
        bar_w = 0.7
        bars = []
        labels = []
        for val in arr:
            h = (val / max_val) * 2.5 + 0.3
            rect = Rectangle(width=bar_w, height=h,
                              fill_color={color_default}, fill_opacity=0.7,
                              stroke_color=WHITE, stroke_width=1)
            lbl = Text(str(val), font_size=18, color=WHITE)
            bars.append(rect)
            labels.append(lbl)

        bar_group = VGroup(*bars).arrange(RIGHT, buff=0.15)
        bar_group.move_to(ORIGIN + DOWN * 0.3)
        for bar, lbl in zip(bars, labels):
            lbl.next_to(bar, DOWN, buff=0.1)

        lbl_group = VGroup(*labels)
        self.play(
            *[FadeIn(b, shift=UP*0.3) for b in bars],
            *[FadeIn(l) for l in labels],
            run_time={run_time},
        )
        self.wait({wait_time})

        # ── Bubble sort with animation ────────────────────────────────────────
        n = len(arr)
        sorted_indices = set()
        for i in range(n - 1):
            swapped = False
            for j in range(n - 1 - i):
                # highlight comparison pair
                self.play(
                    bars[j].animate.set_fill(color={color_active}, opacity=0.9),
                    bars[j+1].animate.set_fill(color={color_active}, opacity=0.9),
                    run_time=0.25,
                )
                if arr[j] > arr[j+1]:
                    arr[j], arr[j+1] = arr[j+1], arr[j]
                    bars[j], bars[j+1] = bars[j+1], bars[j]
                    labels[j], labels[j+1] = labels[j+1], labels[j]

                    pos_j   = bars[j+1].get_center()
                    pos_j1  = bars[j].get_center()
                    lpos_j  = labels[j+1].get_center()
                    lpos_j1 = labels[j].get_center()

                    self.play(
                        bars[j].animate.move_to(pos_j1),
                        bars[j+1].animate.move_to(pos_j),
                        labels[j].animate.move_to(lpos_j1),
                        labels[j+1].animate.move_to(lpos_j1 + DOWN * (bars[j].height + 0.2)),
                        run_time=0.35,
                    )
                    swapped = True

                self.play(
                    bars[j].animate.set_fill(color={color_default}, opacity=0.7),
                    bars[j+1].animate.set_fill(color={color_default}, opacity=0.7),
                    run_time=0.2,
                )

            sorted_idx = n - 1 - i
            sorted_indices.add(sorted_idx)
            self.play(
                bars[sorted_idx].animate.set_fill(color={color_sorted}, opacity=0.85),
                run_time=0.3,
            )
            if not swapped:
                break

        # mark remaining as sorted
        for idx in range(n):
            if idx not in sorted_indices:
                self.play(bars[idx].animate.set_fill(color={color_sorted}, opacity=0.85), run_time=0.2)

        self.wait({wait_time})

        # ── Complexity footer ─────────────────────────────────────────────────
        complexity = Text(
            f"Time: {complexity_time}   Space: {complexity_space}",
            font_size=18, color=GREY,
        )
        complexity.to_edge(DOWN, buff=0.5)
        insight = Text("{key_insight}", font_size=14, color=LIGHT_GREY)
        insight.next_to(complexity, UP, buff=0.15)
        self.play(FadeIn(complexity), FadeIn(insight), run_time={run_time * 0.7})
        self.wait(1.0)
'''


def build_general_code(p: dict, style: str = "dynamic") -> str:
    p = safe_params(p)
    run_time, wait_time = get_animation_timing(style)

    title = escape_for_fstring(p.get("title", "Concept Overview"))
    subtitle = escape_for_fstring(p.get("subtitle", "Visual Explanation"))
    components = p.get("components", ["Input", "Process", "Output", "Result"])[:5]
    descriptions = p.get("component_descriptions", ["" for _ in components])
    relationships = p.get("relationships", [])
    key_concept = escape_for_fstring(p.get("key_concept", ""))
    color_primary = p.get("color_primary", "BLUE")
    color_secondary = p.get("color_secondary", "GREEN")
    color_accent = p.get("color_accent", "YELLOW")

    comps_repr = repr([escape_for_fstring(c) for c in components])
    descs_repr = repr([escape_for_fstring(d) for d in descriptions])

    return f'''from manim import *

class ExplanationScene(Scene):
    def construct(self):
        self.camera.background_color = "#0d1117"

        # ── Title ─────────────────────────────────────────────────────────────
        title = Text("{title}", font_size=34, color={color_accent}, weight=BOLD)
        subtitle = Text("{subtitle}", font_size=18, color=GREY)
        VGroup(title, subtitle).arrange(DOWN, buff=0.15).to_edge(UP, buff=0.4)
        self.play(Write(title), FadeIn(subtitle), run_time={run_time})
        self.wait({wait_time})

        # ── Component boxes ───────────────────────────────────────────────────
        components = {comps_repr}
        descriptions = {descs_repr}
        n = len(components)

        colors = [{color_primary}, {color_secondary}, {color_accent},
                  {color_primary}, {color_secondary}]

        boxes = []
        box_labels = []
        box_descs = []

        for i, (comp, desc) in enumerate(zip(components, descriptions)):
            color = colors[i % len(colors)]
            box = RoundedRectangle(corner_radius=0.2, width=2.0, height=1.0,
                                   fill_color=color, fill_opacity=0.2,
                                   stroke_color=color, stroke_width=2)
            lbl = Text(comp, font_size=18, color=WHITE, weight=BOLD)
            lbl.move_to(box)
            d_txt = Text(str(desc)[:30], font_size=11, color=GREY)
            d_txt.next_to(box, DOWN, buff=0.08)
            boxes.append(box)
            box_labels.append(lbl)
            box_descs.append(d_txt)

        box_group = VGroup(*boxes).arrange(RIGHT, buff=0.8)
        box_group.move_to(ORIGIN + UP * 0.2)

        for lbl, box in zip(box_labels, boxes):
            lbl.move_to(box)
        for d_txt, box in zip(box_descs, boxes):
            d_txt.next_to(box, DOWN, buff=0.08)

        # Animate boxes in
        for box, lbl, d_txt in zip(boxes, box_labels, box_descs):
            self.play(
                FadeIn(box, scale=0.85),
                Write(lbl),
                FadeIn(d_txt),
                run_time={run_time * 0.75},
            )
            self.wait({wait_time})

        # ── Arrows between consecutive components ─────────────────────────────
        arrows = []
        for i in range(len(boxes) - 1):
            arr = Arrow(
                boxes[i].get_right(), boxes[i+1].get_left(),
                buff=0.1, color={color_accent}, stroke_width=2.5,
                max_tip_length_to_length_ratio=0.2,
            )
            arrows.append(arr)
            self.play(GrowArrow(arr), run_time={run_time * 0.5})

        self.wait({wait_time})

        # ── Pulse highlight across all boxes ──────────────────────────────────
        for box, color in zip(boxes, colors):
            self.play(
                box.animate.set_stroke(color=YELLOW, width=4).set_fill(opacity=0.45),
                run_time=0.3,
            )
            self.wait(0.1)
            self.play(
                box.animate.set_stroke(color=color, width=2).set_fill(opacity=0.2),
                run_time=0.25,
            )

        # ── Key concept ───────────────────────────────────────────────────────
        if "{key_concept}":
            concept = Text("{key_concept}", font_size=15, color=GREY)
            concept.to_edge(DOWN, buff=0.35)
            self.play(FadeIn(concept), run_time={run_time * 0.6})

        self.wait(1.0)
'''


def build_physics_code(p: dict, style: str = "cinematic") -> str:
    """Physics scenes reuse the general builder but with physics-flavoured defaults."""
    p.setdefault("color_primary", "BLUE")
    p.setdefault("color_secondary", "TEAL")
    p.setdefault("color_accent", "GOLD")
    return build_general_code(p, style)


# ── Template dispatcher ───────────────────────────────────────────────────────
TEMPLATE_BUILDERS = {
    "data_structure": build_data_structure_code,
    "algorithm": build_algorithm_code,
    "cs_concept": build_general_code,
    "math": build_general_code,
    "physics": build_physics_code,
    "chemistry": build_general_code,
    "biology": build_general_code,
    "general": build_general_code,
}

# ── Prompts ───────────────────────────────────────────────────────────────────
CLASSIFY_PROMPT = """You are a topic classifier for educational Manim visualizations.

Classify the topic into EXACTLY ONE category:
- "data_structure"  → linked lists, trees, graphs, stacks, queues, arrays, hash tables
- "algorithm"       → sorting, searching, dynamic programming, recursion, BFS, DFS
- "cs_concept"      → OOP, memory, OS, networking, databases, APIs
- "math"            → calculus, algebra, geometry, statistics, probability
- "physics"         → mechanics, thermodynamics, electromagnetism, waves
- "chemistry"       → reactions, molecules, bonds, states of matter
- "biology"         → cells, DNA, evolution, organs, ecosystems
- "general"         → anything else

Topic: "{topic}"
Context: "{context}"

Return ONLY JSON: {{"category": "data_structure", "reason": "..."}}"""

VISUAL_INTELLIGENCE = """
IMPORTANT:
- Must be highly visual and include motion/transformation
- Must NOT be text-heavy
- Use at least 8 self.play() animations
- Include at least 3 Arrow() relationships
- Include at least 2 Transform() or ReplacementTransform()
- Think 3Blue1Brown style
"""

BASE_PARAM_PROMPTS = {
    "data_structure": """You are a CS educator generating Manim parameters.

{visual_intelligence}

Topic: "{topic}"
Context: "{context}"

Return ONLY JSON (no markdown):
{{"title":"Short title","subtitle":"Intro subtitle","ds_type":"linked_list","node_count":3,"node_labels":["10","20","30"],"head_label":"HEAD","tail_label":"TAIL/NULL","key_concept":"One sentence insight.","color_node":"TEAL","color_pointer":"PINK","color_head":"GOLD","color_tail":"RED","animation_style":"cinematic"}}""",

    "algorithm": """You are a CS educator generating Manim parameters.

{visual_intelligence}

Topic: "{topic}"
Context: "{context}"

Return ONLY JSON (no markdown):
{{"title":"Short title","subtitle":"Algorithm Walkthrough","algorithm_type":"sorting","input_array":[5,3,8,1,9,2],"complexity_time":"O(n^2)","complexity_space":"O(1)","key_insight":"One sentence insight.","color_active":"YELLOW","color_sorted":"GREEN","color_default":"BLUE","animation_style":"dynamic"}}""",

    "general": """You are an educator generating Manim parameters for a general topic.

{visual_intelligence}

Topic: "{topic}"
Context: "{context}"

Return ONLY JSON (no markdown):
{{"title":"Short title","subtitle":"Understanding: Topic","components":["A","B","C","D"],"component_descriptions":["desc A","desc B","desc C","desc D"],"relationships":[["A","B","leads to"],["B","C","transforms into"]],"flow_steps":["Step 1","Step 2","Step 3"],"key_concept":"Short insight.","color_primary":"BLUE","color_secondary":"GREEN","color_accent":"YELLOW","animation_style":"dynamic"}}""",
}

PARAM_PROMPTS: dict[str, str] = {}
for cat, tmpl in BASE_PARAM_PROMPTS.items():
    PARAM_PROMPTS[cat] = tmpl.replace("{visual_intelligence}", VISUAL_INTELLIGENCE)

for cat in ("cs_concept", "math", "physics", "chemistry", "biology"):
    PARAM_PROMPTS[cat] = PARAM_PROMPTS["general"]


def classify_with_fallback(topic: str, context: str, llm_category: str) -> str:
    tl = topic.lower()
    if any(t in tl for t in ["linked list", "array", "stack", "queue", "tree", "graph", "hash"]):
        return "data_structure"
    if any(t in tl for t in ["sort", "search", "algorithm", "recursion", "dp", "dynamic"]):
        return "algorithm"
    if any(t in tl for t in ["physics", "force", "motion", "energy", "wave", "quantum"]):
        return "physics"
    if any(t in tl for t in ["math", "calculus", "algebra", "geometry", "equation"]):
        return "math"
    if any(t in tl for t in ["chemistry", "molecule", "reaction", "atom"]):
        return "chemistry"
    if any(t in tl for t in ["biology", "cell", "dna", "evolution"]):
        return "biology"
    return llm_category if llm_category in TEMPLATE_BUILDERS else "general"


# ── Render with retry (FIX 6: corrected retry logic) ─────────────────────────
async def render_with_fallback(
    code: str, topic: str, params: dict, builder, style: str, category: str, ctx: str
) -> tuple[str | None, Exception | None]:
    last_error = None
    simplified = False

    for attempt in range(MAX_RETRY_ATTEMPTS):          # 0, 1
        try:
            is_safe, reason = is_safe_code(code)
            if not is_safe:
                raise RuntimeError(f"Security violation: {reason}")
            path = await asyncio.get_event_loop().run_in_executor(
                _pool, render_sync, code, topic
            )
            return path, None
        except Exception as e:
            last_error = e
            logger.warning(f"Render attempt {attempt + 1} failed: {e}")

        # FIX 6: regenerate before EVERY retry attempt (not just first)
        if attempt < MAX_RETRY_ATTEMPTS - 1:
            try:
                if simplified:
                    params = await regenerate_with_stronger_prompt(topic, ctx, category, params)
                else:
                    simplified = True
                    if "node_count" in params:
                        params["node_count"] = min(params["node_count"], 2)
                    if "input_array" in params:
                        params["input_array"] = params["input_array"][:4]
                code = builder(params, style)
            except Exception as regen_err:
                logger.error(f"Regen failed: {regen_err}")

    return None, last_error


# ── Shared pipeline (FIX 7) ───────────────────────────────────────────────────
async def _run_pipeline(
    sanitized_topic: str,
    sanitized_context: str,
    style: str,
    on_progress=None,           # optional async callable(msg, step, pct)
) -> dict:
    """
    Shared classify → param-extract → build → quality-check → render logic.
    Returns a dict with keys: image_url, html, code, cached (bool)
    """
    async def _progress(msg, step, pct):
        if on_progress:
            await on_progress(msg, step, pct)

    ctx = sanitized_context[:300] if sanitized_context else ""
    cache_key = get_cache_key(sanitized_topic, ctx, style)

    await _progress("Starting generation…", "init", 0)

    cached_data, is_cached = get_cached_response(cache_key)
    if is_cached:
        await _progress("Cache hit!", "cache", 100)
        fname = os.path.basename(cached_data["image_path"])
        image_url = f"{BASE_URL}/videos/{fname}"
        return {
            "image_url": image_url,
            "html": _ok_html(image_url, sanitized_topic),
            "code": cached_data.get("code", ""),
            "cached": True,
        }

    await _progress("Analysing topic…", "classify", 10)

    # Classification
    category = "general"
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            raw = await call_llm_with_timeout(
                CLASSIFY_PROMPT.format(topic=sanitized_topic, context=ctx),
                f"Classify: {sanitized_topic}", 100, 0.1,
            )
            raw = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
            m = re.search(r"\{[\s\S]*\}", raw)
            if m:
                category = safe_json_load(m.group()).get("category", "general")
            break
        except Exception:
            if attempt == MAX_RETRY_ATTEMPTS - 1:
                category = "general"

    category = classify_with_fallback(sanitized_topic, ctx, category)
    final_style = get_style_from_category(category, style)
    await _progress(f"Category: {category}", "classified", 20)

    # Parameter extraction
    await _progress("Extracting visual parameters…", "params", 30)
    param_prompt = PARAM_PROMPTS.get(category, PARAM_PROMPTS["general"])
    param_prompt_filled = param_prompt.format(topic=sanitized_topic, context=ctx)

    params: dict = {}
    for attempt in range(MAX_RETRY_ATTEMPTS):
        try:
            raw = await call_llm_with_timeout(
                param_prompt_filled, f"Parameters for: {sanitized_topic}", 900, 0.2
            )
            raw = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
            m = re.search(r"\{[\s\S]*\}", raw)
            if m:
                js = m.group()
                js += "]" * max(0, js.count("[") - js.count("]"))
                js += "}" * max(0, js.count("{") - js.count("}"))
                params = safe_json_load(js)
                break
        except Exception:
            if attempt == MAX_RETRY_ATTEMPTS - 1:
                params = {}

    # Build code
    await _progress("Building animation code…", "build", 50)
    builder = TEMPLATE_BUILDERS[category]
    code = builder(params, final_style)

    # Quality check
    is_good, issues, quality_score = check_visual_quality(code)
    if not is_good:
        await _progress(f"Improving quality (score {quality_score})…", "optimize", 60)
        params = await regenerate_with_stronger_prompt(sanitized_topic, ctx, category, params)
        code = builder(params, final_style)

    # Render
    await _progress("Rendering with Manim…", "render", 70)
    path, render_error = await render_with_fallback(
        code, sanitized_topic, params, builder, final_style, category, ctx
    )
    if render_error:
        raise render_error

    await _progress("Saving…", "save", 90)
    save_to_cache(cache_key, path, code, sanitized_topic)

    fname = os.path.basename(path)
    image_url = f"{BASE_URL}/videos/{fname}"        # FIX 2

    await _progress("Complete!", "done", 100)
    return {
        "image_url": image_url,
        "html": _ok_html(image_url, sanitized_topic),
        "code": code,
        "cached": False,
    }


# ── HTML helpers ──────────────────────────────────────────────────────────────
def _ok_html(image_url: str, topic: str) -> str:
    cache_key = hashlib.md5(topic.encode()).hexdigest()
    safe_topic = topic.replace('"', "&quot;")
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#07090f;font-family:'Segoe UI',sans-serif;color:white;padding:14px}}
.ttl{{text-align:center;font-size:12px;font-weight:bold;color:#00bfff;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px}}
.frame{{border:1px solid rgba(0,191,255,.2);border-radius:10px;overflow:hidden;box-shadow:0 0 22px rgba(0,191,255,.08)}}
img{{width:100%;display:block}}
.foot{{margin-top:8px;text-align:center;font-size:10px;color:#444}}
.feedback{{margin-top:8px;text-align:center;font-size:10px;color:#666}}
.feedback-btn{{background:rgba(0,191,255,0.1);border:1px solid rgba(0,191,255,0.3);border-radius:4px;padding:4px 12px;margin:0 4px;cursor:pointer;color:white}}
.feedback-btn:hover{{background:rgba(0,191,255,0.2)}}
</style>
<script>
function submitFeedback(rating){{
  fetch('/generate-visual/feedback',{{method:'POST',headers:{{'Content-Type':'application/json'}},
    body:JSON.stringify({{cache_key:"{cache_key}",rating:rating}})}});
  document.getElementById('fb').innerHTML='Thanks!';
}}
</script>
</head><body>
<div class="ttl">Manim · {safe_topic}</div>
<div class="frame"><img src="{image_url}" alt="{safe_topic}"/></div>
<div class="foot">Generated by AI · Manim Community Edition</div>
<div class="feedback">
  <span>Helpful?</span>
  <button class="feedback-btn" onclick="submitFeedback('good')">👍 Yes</button>
  <button class="feedback-btn" onclick="submitFeedback('bad')">👎 No</button>
  <span id="fb"></span>
</div>
</body></html>"""


def _err_html(topic: str, err: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{{background:#07090f;color:white;font-family:'Segoe UI',sans-serif;padding:28px;text-align:center}}
.e{{color:#ff9b5b;font-size:12px;margin:14px 0;background:rgba(255,80,0,.08);border:1px solid rgba(255,80,0,.2);border-radius:8px;padding:10px;text-align:left}}
pre{{font-size:10px;color:#777;white-space:pre-wrap}}
</style></head><body>
<div style="font-size:18px;color:#00bfff;margin-bottom:10px">{topic}</div>
<div class="e">⚠ Render failed:<br><pre>{err[:500]}</pre></div>
<div style="font-size:11px;color:#555;margin-top:10px">Try regenerating — AI may produce cleaner code.</div>
</body></html>"""


# ── Streaming progress helper ─────────────────────────────────────────────────
class ProgressStream:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()

    async def send(self, message: str, step: str, progress: int):
        await self.queue.put(json.dumps({
            "type": "progress", "message": message,
            "step": step, "progress": progress,
            "timestamp": datetime.now().isoformat(),
        }))

    async def send_result(self, image_url: str, html: str, code: str):
        await self.queue.put(json.dumps({"type": "result", "image_url": image_url, "html": html, "code": code}))

    async def send_error(self, error: str):
        await self.queue.put(json.dumps({"type": "error", "error": error}))

    async def stream(self):
        while True:
            try:
                data = await self.queue.get()
                yield f"data: {data}\n\n"
                if json.loads(data).get("type") in ("result", "error"):
                    break
            except asyncio.CancelledError:
                break


# ── Feedback endpoint ─────────────────────────────────────────────────────────
@router.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    try:
        fp = os.path.join(FEEDBACK_DIR, f"{feedback.cache_key}_{datetime.now().timestamp()}.json")
        with open(fp, "w") as f:
            json.dump({
                "cache_key": feedback.cache_key,
                "rating": feedback.rating,
                "reason": feedback.reason,
                "timestamp": datetime.now().isoformat(),
            }, f)
        logger.info(f"Feedback: {feedback.rating} for {feedback.cache_key}")
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Feedback error: {e}")
        return {"status": "error"}


# ── Streaming route (FIX 7: delegates to _run_pipeline) ──────────────────────
@router.post("/stream")
async def generate_visual_stream(
    req: VisualRequest,
    request: Request,
    auth_valid: bool = Depends(verify_api_key),
):
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests")

    sanitized_topic = sanitize_input(req.topic)
    sanitized_context = sanitize_input(req.context)
    if not sanitized_topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")

    progress = ProgressStream()

    async def generate():
        try:
            result = await _run_pipeline(
                sanitized_topic,
                sanitized_context,
                req.style,
                on_progress=progress.send,
            )
            await progress.send_result(result["image_url"], result["html"], result["code"])
        except Exception as e:
            logger.error(f"Stream error: {e}")
            await progress.send_error(str(e))

    asyncio.create_task(generate())
    return StreamingResponse(progress.stream(), media_type="text/event-stream")


# ── Standard route (FIX 7: delegates to _run_pipeline) ───────────────────────
@router.post("", response_model=VisualResponse)
async def generate_visual(
    req: VisualRequest,
    request: Request,
    auth_valid: bool = Depends(verify_api_key),
):
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")

    async with request_semaphore:
        sanitized_topic = sanitize_input(req.topic)
        sanitized_context = sanitize_input(req.context)
        if not sanitized_topic.strip():
            raise HTTPException(status_code=400, detail="Topic cannot be empty.")

        try:
            logger.info(f"Processing: {sanitized_topic} | Style: {req.style}")
            result = await _run_pipeline(sanitized_topic, sanitized_context, req.style)
            return VisualResponse(
                html=result["html"],
                image_url=result["image_url"],
                code=result["code"],
                status="success",
                cached=result["cached"],
            )
        except Exception as e:
            err = str(e)
            logger.error(f"ERROR: {err[:300]}")
            traceback.print_exc()
            return VisualResponse(
                html=_err_html(sanitized_topic, err),
                image_url="",
                code="",
                status="error",
                cached=False,
            )
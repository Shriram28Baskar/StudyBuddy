import os
import re
import tempfile
import uuid
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor

VIDEOS_DIR    = os.path.abspath(os.getenv("VIDEOS_DIR", "./videos"))
MANIM_TIMEOUT = int(os.getenv("MANIM_TIMEOUT", "180"))
TEMP_BASE     = os.path.join(tempfile.gettempdir(), "manim_temp")

_executor = ThreadPoolExecutor(max_workers=2)


def ensure_dirs():
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    os.makedirs(TEMP_BASE, exist_ok=True)


def extract_scene_name(code: str) -> str:
    match = re.search(r"class\s+(\w+)\s*\(Scene\)", code)
    return match.group(1) if match else "ExplanationScene"


def clean_code(raw: str) -> str:
    raw = re.sub(r"```(?:python)?\s*", "", raw)
    raw = raw.replace("```", "").strip()
    return raw


def _run_manim_sync(cmd: list, cwd: str) -> tuple:
    """Run manim synchronously in a thread — avoids asyncio subprocess issues on Windows."""
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=cwd,
        timeout=MANIM_TIMEOUT,
    )
    return result.returncode, result.stdout, result.stderr


async def render_manim_code(code: str, topic: str = "scene") -> str:
    """
    Render Manim code to mp4.
    Uses ThreadPoolExecutor + subprocess to avoid Windows asyncio limitations.
    """
    import asyncio

    ensure_dirs()

    code       = clean_code(code)
    scene_name = extract_scene_name(code)
    job_id     = str(uuid.uuid4())[:8]
    safe_topic = re.sub(r"[^a-zA-Z0-9]", "_", topic)[:20]

    job_dir = os.path.join(TEMP_BASE, job_id)
    out_dir = os.path.join(job_dir, "output")
    py_file = os.path.join(job_dir, "scene.py")
    os.makedirs(out_dir, exist_ok=True)

    try:
        # Write scene file
        with open(py_file, "w", encoding="utf-8") as f:
            f.write(code)

        cmd = [
            "manim", "-ql",
            "--disable_caching",
            "--media_dir", out_dir,
            "--output_file", f"{safe_topic}_{job_id}",
            py_file,
            scene_name,
        ]

        print(f"[manim] Rendering: {scene_name} for '{topic}'")

        # Run in thread pool to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        try:
            returncode, stdout, stderr = await asyncio.wait_for(
                loop.run_in_executor(_executor, _run_manim_sync, cmd, job_dir),
                timeout=MANIM_TIMEOUT + 10,
            )
        except asyncio.TimeoutError:
            raise RuntimeError(f"Manim timed out after {MANIM_TIMEOUT}s.")
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Manim process timed out after {MANIM_TIMEOUT}s.")

        print(f"[manim] Exit code: {returncode}")
        if stderr:
            print(f"[manim] stderr (last 500):\n{stderr[-500:]}")

        if returncode != 0:
            error_lines = [
                l for l in stderr.split("\n")
                if any(w in l for w in ["Error", "error", "Exception", "invalid"])
            ]
            short_error = "\n".join(error_lines[-5:]) if error_lines else stderr[-500:]
            raise RuntimeError(f"Manim render error:\n{short_error}")

        # Find video
        video_path = find_video(out_dir) or find_video(job_dir)
        if not video_path:
            raise RuntimeError("Manim ran but no video was produced.")

        # Copy to videos dir
        final_name = f"{safe_topic}_{job_id}.mp4"
        final_path = os.path.join(VIDEOS_DIR, final_name)
        shutil.copy2(video_path, final_path)
        print(f"[manim] Video saved: {final_path}")

        return final_path

    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


def find_video(directory: str) -> str:
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".mp4"):
                return os.path.join(root, file)
    return None
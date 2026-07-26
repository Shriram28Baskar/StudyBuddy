"""
services/image_classifier.py

Classifies extracted images and generates rich captions for retrieval.

Uses a single Groq Vision LLM call per image to:
  1. Classify the image type (flowchart, weighted_graph, table, etc.)
  2. Generate a rich semantic caption used for embedding-based retrieval

A 2-second delay is introduced between calls to respect Groq free-tier
rate limits. Classification + captioning is capped by the upstream
image filter (max 10 images per document).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
from typing import Optional

from tenacity import retry, stop_after_attempt, wait_fixed

from services.llm import complete_with_vision

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_TYPES = {
    "weighted_graph", "flowchart", "table", "circuit_diagram",
    "architecture_diagram", "equation", "geometry", "uml",
    "er_diagram", "state_machine", "screenshot", "other",
}

_CLASSIFY_PROMPT = """You are an expert at analyzing academic and technical images.

Analyze this image extracted from an educational document and respond with ONLY valid JSON.

1. CLASSIFY — choose exactly one type from this list:
   weighted_graph, flowchart, table, circuit_diagram, architecture_diagram,
   equation, geometry, uml, er_diagram, state_machine, screenshot, other

2. CONFIDENCE — your confidence in the classification (0.0 to 1.0)

3. CAPTION — write 2-4 sentences describing:
   - What the image shows (labels, values, structure visible)
   - What academic concept it illustrates
   - Any key information visible (node names, edge weights, column headers, etc.)

Respond ONLY in this exact JSON format (no markdown, no extra text):
{
  "type": "flowchart",
  "confidence": 0.92,
  "caption": "A flowchart illustrating the four phases of the CPU instruction cycle..."
}"""

INTER_CALL_DELAY = 2.0   # seconds between vision API calls (rate-limit guard)


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------

@retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
async def _call_vision(image_b64: str, media_type: str) -> str:
    """Single-attempt vision call with retry."""
    return await complete_with_vision(
        image_b64=image_b64,
        prompt=_CLASSIFY_PROMPT,
        image_media_type=media_type,
        max_tokens=300,
    )


def _parse_response(raw: str) -> Optional[dict]:
    """Extract JSON from LLM response, handling markdown code fences."""
    # Strip markdown fences
    raw = re.sub(r"```(?:json)?", "", raw, flags=re.IGNORECASE).strip()
    try:
        data = json.loads(raw)
        img_type   = data.get("type", "other")
        confidence = float(data.get("confidence", 0.5))
        caption    = str(data.get("caption", "")).strip()
        # Validate type
        if img_type not in VALID_TYPES:
            img_type = "other"
        return {
            "type":       img_type,
            "confidence": round(max(0.0, min(1.0, confidence)), 3),
            "caption":    caption if caption else "Academic diagram extracted from document.",
        }
    except Exception:
        return None


async def classify_and_caption(image_path: str) -> dict:
    """
    Classify an image and generate a retrieval caption.

    Returns:
        {
            "type":       str,    # e.g. "weighted_graph"
            "confidence": float,  # 0.0–1.0
            "caption":    str,    # rich description for embedding
        }

    Falls back to safe defaults on any failure — never raises.
    """
    ext = image_path.rsplit(".", 1)[-1].lower()
    media_type = "image/png" if ext == "png" else "image/jpeg"

    try:
        with open(image_path, "rb") as f:
            image_b64 = base64.b64encode(f.read()).decode("utf-8")

        raw = await _call_vision(image_b64, media_type)
        result = _parse_response(raw)
        if result:
            return result
    except Exception:
        pass

    # Graceful fallback
    return {
        "type":       "other",
        "confidence": 0.5,
        "caption":    "Academic diagram or figure extracted from the document.",
    }


async def classify_images_batch(image_metas: list[dict]) -> list[dict]:
    """
    Classify a list of images sequentially with a rate-limit delay between calls.

    Args:
        image_metas: list of dicts from rag_images.extract_and_store_images()

    Returns:
        Same list, each entry enriched with "type", "confidence", "caption".
    """
    enriched = []
    for i, meta in enumerate(image_metas):
        if i > 0:
            await asyncio.sleep(INTER_CALL_DELAY)
        classification = await classify_and_caption(meta["image_path"])
        enriched.append({**meta, **classification})
    return enriched

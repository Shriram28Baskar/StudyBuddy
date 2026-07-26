"""
services/rag_images.py

Image extraction, filtering, and storage for the multimodal RAG pipeline.

Responsibilities:
- Extract embedded images from PDF pages using PyMuPDF
- Filter out decorative/insignificant images (too small, wrong aspect ratio)
- Cap at MAX_IMAGES_PER_DOC, prioritising information-dense (large) figures
- Save kept images to uploads/images/{doc_id}/
"""

from __future__ import annotations

import io
import os
from typing import List

from dotenv import load_dotenv

load_dotenv()

UPLOAD_DIR        = os.getenv("UPLOAD_DIR", "./uploads")
IMAGES_SUBDIR     = os.path.join(UPLOAD_DIR, "images")

# Filtering thresholds
MIN_WIDTH         = 100          # pixels
MIN_HEIGHT        = 100          # pixels
MIN_SIZE_BYTES    = 5_000        # 5 KB
MAX_ASPECT_RATIO  = 8.0          # skip very narrow horizontal/vertical strips
MAX_IMAGES_PER_DOC = 10          # hard cap — largest figures by area


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_and_store_images(pdf_path: str, doc_id: str) -> List[dict]:
    """
    Extract images from a PDF, filter, and save to disk.

    Returns a list of image metadata dicts:
        {
            "page_num": int,
            "image_index": int,
            "image_path": str,   # absolute path on disk
            "image_url": str,    # URL path served by FastAPI StaticFiles
            "width": int,
            "height": int,
        }
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF is not installed. Run: pip install pymupdf")

    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is not installed. Run: pip install pillow")

    doc = fitz.open(pdf_path)
    candidates: List[dict] = []

    for page_num, page in enumerate(doc, start=1):
        image_list = page.get_images(full=True)
        for img_idx, img_ref in enumerate(image_list):
            xref = img_ref[0]
            try:
                base_image = doc.extract_image(xref)
            except Exception:
                continue

            img_bytes = base_image["image"]
            ext       = base_image.get("ext", "png").lower()

            # ── Size filter ──────────────────────────────────────────────
            if len(img_bytes) < MIN_SIZE_BYTES:
                continue

            # ── Dimension + aspect ratio filter (via Pillow) ─────────────
            try:
                with Image.open(io.BytesIO(img_bytes)) as pil_img:
                    w, h = pil_img.size
            except Exception:
                continue

            if w < MIN_WIDTH or h < MIN_HEIGHT:
                continue
            aspect = max(w, h) / max(min(w, h), 1)
            if aspect > MAX_ASPECT_RATIO:
                continue

            candidates.append({
                "page_num":    page_num,
                "image_index": img_idx,
                "bytes":       img_bytes,
                "ext":         ext if ext in ("png", "jpg", "jpeg") else "png",
                "width":       w,
                "height":      h,
                "pixel_area":  w * h,
            })

    doc.close()

    # ── Cap: keep top MAX_IMAGES_PER_DOC by pixel area ───────────────────
    candidates.sort(key=lambda x: x["pixel_area"], reverse=True)
    kept = candidates[:MAX_IMAGES_PER_DOC]

    # ── Save to disk ──────────────────────────────────────────────────────
    img_dir = os.path.join(IMAGES_SUBDIR, doc_id)
    os.makedirs(img_dir, exist_ok=True)

    results: List[dict] = []
    for item in kept:
        filename   = f"page{item['page_num']}_img{item['image_index']}.{item['ext']}"
        image_path = os.path.join(img_dir, filename)
        with open(image_path, "wb") as f:
            f.write(item["bytes"])

        results.append({
            "page_num":    item["page_num"],
            "image_index": item["image_index"],
            "image_path":  image_path,
            "image_url":   f"/doc-images/{doc_id}/{filename}",
            "width":       item["width"],
            "height":      item["height"],
        })

    return results

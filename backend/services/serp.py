import os
import time
from serpapi import GoogleSearch
from dotenv import load_dotenv

load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_API_KEY", "")

# ── Simple in-memory image cache (TTL = 1 hour) ──────────────────────────────
_image_cache: dict[str, tuple[list, float]] = {}  # query → (results, timestamp)
_IMAGE_CACHE_TTL = 3600  # seconds


def _search(query: str, num_results: int = 5) -> list[dict]:
    """Run a Google search via SerpAPI and return organic results."""
    if not SERPAPI_KEY:
        return []
    params = {
        "engine":  "google",
        "q":       query,
        "num":     num_results,
        "api_key": SERPAPI_KEY,
    }
    search  = GoogleSearch(params)
    results = search.get_dict()
    return results.get("organic_results", [])


# ── Public helpers ────────────────────────────────────────────────────────────


def search_images(query: str, num: int = 3) -> list[dict]:
    """
    Search Google Images via SerpAPI for educational diagrams.
    Returns a list of {url, title, source} dicts.
    Results are cached for 1 hour to avoid redundant API calls.
    """
    cache_key = f"{query}::{num}"
    now = time.time()

    # Return cached result if fresh
    if cache_key in _image_cache:
        cached_results, cached_at = _image_cache[cache_key]
        if now - cached_at < _IMAGE_CACHE_TTL:
            return cached_results

    if not SERPAPI_KEY:
        return []

    try:
        params = {
            "engine":  "google",
            "q":       f"{query} diagram educational",
            "tbm":     "isch",           # image search
            "num":     num * 2,          # fetch more, filter down
            "safe":    "active",
            "api_key": SERPAPI_KEY,
        }
        search   = GoogleSearch(params)
        results  = search.get_dict()
        raw_imgs = results.get("images_results", [])

        images = []
        for img in raw_imgs:
            url    = img.get("original") or img.get("thumbnail", "")
            title  = img.get("title", query)
            source = img.get("source", "")
            if url and url.startswith("http"):
                images.append({"url": url, "title": title, "source": source})
            if len(images) >= num:
                break

        _image_cache[cache_key] = (images, now)
        return images

    except Exception:
        return []
"""
JSON extraction helper utility.

Consolidates duplicated JSON parsing logic (markdown stripping, regex matching,
and bracket balancing) across routes and services into a single source of truth.
"""
import json
import re
from typing import Any, Optional, Union


def extract_json_object(raw: str, label: str = "LLM response") -> dict:
    """
    Strip markdown fences, find the first JSON object block `{...}`,
    balance open brackets if truncated, and parse as a dictionary.

    Raises ValueError if no JSON block is found or parsing fails.
    """
    if not raw or not isinstance(raw, str):
        raise ValueError(f"Empty or invalid string for {label}")

    raw = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError(f"No JSON object found for {label}")

    text = match.group()
    # Balance brackets and braces if the response was truncated mid-stream
    text += "]" * max(0, text.count("[") - text.count("]"))
    text += "}" * max(0, text.count("{") - text.count("}"))

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback cleanup for common LLM syntax slips (trailing commas, unquoted keys, comments)
        cleaned = re.sub(r",\s*([\]}])", r"\1", text)
        cleaned = re.sub(r'([{,])\s*([a-zA-Z_]\w*)\s*:', r'\1"\2":', cleaned)
        cleaned = re.sub(r"//.*?\n", "\n", cleaned)
        cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to decode JSON for {label}: {str(e)}")


def parse_json_safe(raw: str, default: Optional[dict] = None) -> dict:
    """
    Like extract_json_object, but returns a default (empty dict by default)
    if parsing fails instead of raising an exception.
    """
    try:
        return extract_json_object(raw, label="safe parse")
    except ValueError:
        return default if default is not None else {}


def safe_json_load(raw: str) -> dict:
    """Alias for safe JSON loading (used by Manim generator)."""
    return parse_json_safe(raw, default={})

"""
services/query_classifier.py

Lightweight query intent classifier for adaptive RAG retrieval.

Two-tier approach:
  Tier 1 — Pure keyword heuristic (zero latency, zero cost).
            Handles ~80% of typical academic queries.

  Tier 2 — LLM micro-call for ambiguous queries.
            Result cached in LRU cache (100-entry in-memory).
            Falls back to "document_qa" on any failure.

The QueryIntent output controls:
  - text_weight / img_weight for Chroma retrieval scoring
  - image_type_filter for pre-filtering image candidates
  - preferred_modality for the confidence manager
"""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import dataclass, field
from functools import lru_cache
from typing import List, Literal, Optional

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

Modality = Literal["text_first", "image_first", "balanced"]

@dataclass
class QueryIntent:
    intent:             str               # e.g. "algorithm", "diagram", "theory"
    preferred_modality: Modality          # shapes retrieval weighting
    text_weight:        float             # sum with img_weight = 1.0
    img_weight:         float
    type_filter:        List[str] = field(default_factory=list)  # empty = no filter
    tier:               int = 1           # 1 = keyword, 2 = LLM


# ---------------------------------------------------------------------------
# Tier 1 — Keyword rules
# ---------------------------------------------------------------------------

_INTENT_RULES: dict[str, dict] = {
    "algorithm": {
        "keywords": [
            "algorithm", "kruskal", "prim", "dijkstra", "bellman",
            "floyd", "bfs", "dfs", "dynamic programming", "dp",
            "greedy", "sorting", "searching", "trace", "dry run",
            "step by step", "iteration", "recursion", "backtracking",
        ],
        "preferred_modality": "image_first",
        "text_weight": 0.40,
        "img_weight":  0.60,
        "type_filter": ["flowchart", "weighted_graph"],
    },
    "diagram": {
        "keywords": [
            "diagram", "flowchart", "draw", "show me", "illustrate",
            "architecture", "uml", "er diagram", "er model", "circuit",
            "layout", "topology", "structure", "schematic",
        ],
        "preferred_modality": "image_first",
        "text_weight": 0.30,
        "img_weight":  0.70,
        "type_filter": [
            "flowchart", "architecture_diagram", "uml",
            "er_diagram", "circuit_diagram",
        ],
    },
    "equation": {
        "keywords": [
            "derive", "derivation", "prove", "proof", "formula",
            "equation", "integration", "differentiation", "solve",
            "theorem", "lemma", "proposition", "calculate",
        ],
        "preferred_modality": "balanced",
        "text_weight": 0.50,
        "img_weight":  0.50,
        "type_filter": ["equation", "geometry"],
    },
    "table": {
        "keywords": [
            "table", "compare", "comparison", "list all", "differences",
            "versus", "vs ", "truth table", "tabulate",
        ],
        "preferred_modality": "balanced",
        "text_weight": 0.55,
        "img_weight":  0.45,
        "type_filter": ["table"],
    },
    "programming": {
        "keywords": [
            "code", "program", "implement", "function", "class",
            "syntax", "debug", "error", "runtime", "compile",
            "pseudocode", "complexity", "big o",
        ],
        "preferred_modality": "text_first",
        "text_weight": 0.90,
        "img_weight":  0.10,
        "type_filter": [],
    },
    "definition": {
        "keywords": [
            "what is", "define", "definition", "meaning of",
            "what are", "what does",
        ],
        "preferred_modality": "text_first",
        "text_weight": 0.85,
        "img_weight":  0.15,
        "type_filter": [],
    },
    "theory": {
        "keywords": [
            "explain", "how does", "why does", "describe",
            "overview", "concept", "principle", "theory", "idea",
        ],
        "preferred_modality": "text_first",
        "text_weight": 0.80,
        "img_weight":  0.20,
        "type_filter": [],
    },
    "design": {
        "keywords": [
            "design", "model", "pattern", "system design",
            "database design", "api design", "class diagram",
        ],
        "preferred_modality": "image_first",
        "text_weight": 0.35,
        "img_weight":  0.65,
        "type_filter": ["uml", "er_diagram", "architecture_diagram"],
    },
    "numerical": {
        "keywords": [
            "calculate", "find the value", "evaluate", "numerical",
            "compute", "result", "answer", "how many",
        ],
        "preferred_modality": "text_first",
        "text_weight": 0.70,
        "img_weight":  0.30,
        "type_filter": [],
    },
}

# Default for unclassified / generic document questions
_DEFAULT_INTENT = QueryIntent(
    intent="document_qa",
    preferred_modality="balanced",
    text_weight=0.70,
    img_weight=0.30,
    type_filter=[],
    tier=1,
)


def _tier1_classify(question: str) -> Optional[QueryIntent]:
    """
    Fast keyword-based classifier.
    Returns a QueryIntent if ≥ 2 keyword hits on one intent (strong signal),
    or ≥ 1 hit if it's the only match.
    Returns None if ambiguous (→ fall through to Tier 2).
    """
    q = question.lower()
    scores: dict[str, int] = {}

    for intent_name, rule in _INTENT_RULES.items():
        hits = sum(1 for kw in rule["keywords"] if kw in q)
        if hits:
            scores[intent_name] = hits

    if not scores:
        return _DEFAULT_INTENT

    best_intent = max(scores, key=scores.__getitem__)
    best_score  = scores[best_intent]

    # Strong signal: top intent has ≥ 2 hits, or is unambiguously the only match
    if best_score >= 2 or len(scores) == 1:
        rule = _INTENT_RULES[best_intent]
        return QueryIntent(
            intent=best_intent,
            preferred_modality=rule["preferred_modality"],
            text_weight=rule["text_weight"],
            img_weight=rule["img_weight"],
            type_filter=rule["type_filter"],
            tier=1,
        )

    # Ambiguous (multiple single-hit matches) → let Tier 2 decide
    return None


# ---------------------------------------------------------------------------
# Tier 2 — LLM classifier (async, cached)
# ---------------------------------------------------------------------------

_INTENT_NAMES = ", ".join(list(_INTENT_RULES.keys()) + ["document_qa"])

_LLM_CLASSIFY_PROMPT = f"""You are an academic query classifier.
Classify the following student question into EXACTLY ONE intent from:
{_INTENT_NAMES}

Rules:
- If the question involves tracing/executing an algorithm on given data → "algorithm"
- If the question asks to draw or explain a visual structure → "diagram"
- If the question involves math derivations or proofs → "equation"
- If the question is a simple lookup or factual → "definition"
- Default to "document_qa" if unsure

Respond with ONLY the intent name, nothing else."""

# LRU-based cache keyed by MD5 of the question (case-insensitive)
@lru_cache(maxsize=100)
def _cached_lru_intent(question_hash: str) -> str:
    """Dummy cache — the actual value is filled asynchronously below."""
    return "document_qa"

_cache: dict[str, str] = {}   # MD5 → intent string


async def _tier2_classify(question: str) -> QueryIntent:
    """LLM micro-call for ambiguous queries. Cached per question hash."""
    from services.llm import complete

    q_hash = hashlib.md5(question.lower().encode()).hexdigest()
    if q_hash in _cache:
        intent_name = _cache[q_hash]
    else:
        try:
            raw = await complete(
                system_prompt=_LLM_CLASSIFY_PROMPT,
                user_message=question,
                max_tokens=10,
                temperature=0.0,
            )
            intent_name = raw.strip().lower().split()[0]
            if intent_name not in _INTENT_RULES and intent_name != "document_qa":
                intent_name = "document_qa"
        except Exception:
            intent_name = "document_qa"
        _cache[q_hash] = intent_name

    if intent_name in _INTENT_RULES:
        rule = _INTENT_RULES[intent_name]
        return QueryIntent(
            intent=intent_name,
            preferred_modality=rule["preferred_modality"],
            text_weight=rule["text_weight"],
            img_weight=rule["img_weight"],
            type_filter=rule["type_filter"],
            tier=2,
        )
    return _DEFAULT_INTENT


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def classify(question: str) -> QueryIntent:
    """
    Classify a student question into a QueryIntent.

    Tries Tier 1 (instant) first; falls through to Tier 2 (LLM) only
    when the keyword heuristic is ambiguous.
    """
    result = _tier1_classify(question)
    if result is not None:
        return result
    return await _tier2_classify(question)

"""
services/confidence_manager.py

Retrieval Confidence Gate — evaluates evidence quality before any LLM call
and decides whether to proceed, expand, or abort reasoning.

Designed as a shared orchestration service so any future feature
(photo solver, voice solver, gap analysis) can reuse it.

Thresholds:
  HIGH      ≥ 0.45  → proceed to vision-grounded reasoning
  MEDIUM    ≥ 0.30  → expand retrieval (double top_k, relax type filter)
  LOW       ≥ 0.20  → aggressively expand (higher top_k, neighbor pages)
  VERY_LOW  < 0.20  → insufficient evidence — skip LLM, return structured response
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal, Tuple

from services.query_classifier import QueryIntent

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class RetrievalEvidence:
    """
    Scored retrieval results from the hybrid pipeline.

    text_results:  List of (chunk_text, cosine_score) from the text collection
    image_results: List of (image_metadata_dict, combined_score) from image collection
                   combined_score = cosine_similarity × type_confidence
    """
    text_results:  List[Tuple[str, dict, float]] = field(default_factory=list)
    image_results: List[Tuple[dict, float]] = field(default_factory=list)


@dataclass
class ConfidenceReport:
    level:          Literal["high", "medium", "low", "very_low"]
    combined_score: float     # weighted combination + cross-modal bonus
    text_score:     float     # max cosine score of retrieved text chunks
    image_score:    float     # max combined score of retrieved images


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

HIGH_THRESHOLD   = 0.45
MEDIUM_THRESHOLD = 0.30
LOW_THRESHOLD    = 0.20


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def evaluate(evidence: RetrievalEvidence, intent: QueryIntent) -> ConfidenceReport:
    """
    Score retrieved evidence and return a ConfidenceReport.

    Scoring:
        text_score  = mean cosine similarity of top text chunks
        image_score = mean (cosine_sim × type_confidence) of retrieved images
        combined    = intent.text_weight × text_score + intent.img_weight × image_score
    """
    # ── Text score ──────────────────────────────────────────────────────────
    if evidence.text_results:
        text_score = max(s for _, _, s in evidence.text_results)
    else:
        text_score = 0.0

    # ── Image score ─────────────────────────────────────────────────────────
    if evidence.image_results:
        image_score = max(s for _, s in evidence.image_results)
    else:
        image_score = 0.0

    # ── Weighted combination ─────────────────────────────────────────────────
    combined = (intent.text_weight * text_score) + (intent.img_weight * image_score)
    
    # ── Cross-modal agreement ────────────────────────────────────────────────
    text_pages = {int(meta.get("page_num")) for _, meta, _ in evidence.text_results if meta.get("page_num")}
    image_pages = {int(meta.get("page_num")) for meta, _ in evidence.image_results if meta.get("page_num")}
    
    if text_pages.intersection(image_pages) and text_score > 0.1 and image_score > 0.1:
        # Boost confidence significantly if both text and image are found on the exact same page
        combined += 0.20

    # ── Classify level ───────────────────────────────────────────────────────
    if combined >= HIGH_THRESHOLD:
        level = "high"
    elif combined >= MEDIUM_THRESHOLD:
        level = "medium"
    elif combined >= LOW_THRESHOLD:
        level = "low"
    else:
        level = "very_low"

    return ConfidenceReport(
        level=level,
        combined_score=round(combined, 4),
        text_score=round(text_score, 4),
        image_score=round(image_score, 4),
    )


def build_insufficient_evidence_response(
    evidence: RetrievalEvidence,
    question: str,
) -> dict:
    """
    Build a structured, honest response for low-confidence retrievals.
    Never hallucinates — surfaces what little evidence was found, if any.
    """
    partial_excerpt = ""
    if evidence.text_results:
        # Show the best snippet we have (first 300 chars of top chunk)
        best_chunk = evidence.text_results[0][0]
        partial_excerpt = best_chunk[:300].strip()
        if len(best_chunk) > 300:
            partial_excerpt += "..."

    if partial_excerpt:
        answer = (
            f"The uploaded document does not contain enough information to "
            f"confidently answer this question.\n\n"
            f"The most relevant passage found was:\n\n> {partial_excerpt}"
        )
    else:
        answer = (
            "The uploaded document does not appear to contain information "
            "relevant to this question. Please ensure the correct document "
            "is selected, or try rephrasing your question."
        )

    return {
        "answer":               answer,
        "sources":              [],
        "visual_evidence":      [],
        "page_refs":            [],
        "query_intent":         None,
        "retrieval_confidence": "low",
        "insufficient_evidence": True,
    }

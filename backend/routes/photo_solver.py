import base64
import json
import re
from typing import List, Optional

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from pydantic import BaseModel

from services.llm import complete, complete_with_vision
from utils.json_helper import extract_json_object as _extract_json_object

router = APIRouter()

# ---------------------------------------------------------------------------
# Allowed upload constraints
# ---------------------------------------------------------------------------

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class SolutionStep(BaseModel):
    step_number: int
    description: str
    working: Optional[str] = None
    note: Optional[str] = None


class PhotoSolverResponse(BaseModel):
    detected_subject: str
    detected_question: str
    difficulty: str
    solution_steps: List[SolutionStep]
    final_answer: str
    key_concepts: List[str]
    common_mistakes: List[str]
    similar_questions: List[str]


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/solve", response_model=PhotoSolverResponse)
async def solve_photo(
    image: UploadFile = File(..., description="Photo of the question (JPG, PNG, or WEBP)"),
    subject: str = Form(default="", description="Optional subject hint (e.g. Mathematics)"),
):
    """
    Accept an image of a question, extract the question via vision model,
    solve it step-by-step with the text model, and return a structured response.
    """

    # ── 1. Validate content-type ────────────────────────────────────────────
    content_type = (image.content_type or "").lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported image type '{content_type}'. Allowed: JPEG, PNG, WEBP.",
        )

    # ── 2. Read & validate size ─────────────────────────────────────────────
    try:
        content = await image.read()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to read image: {exc}")

    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(content) // (1024*1024)} MB). Max allowed: 10 MB.",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Image file is empty.")

    # ── 3. Encode to base64 ─────────────────────────────────────────────────
    image_b64 = base64.b64encode(content).decode()

    # ── 4. Vision pass — extract question + metadata ────────────────────────
    extraction_prompt = (
        "You are an academic question extractor. Look at this image carefully.\n"
        "Extract the exact question text visible in the image.\n"
        "Detect the subject (Mathematics/Physics/Chemistry/Biology/Computer Science/General).\n"
        "Estimate difficulty.\n"
        "Return ONLY valid JSON:\n"
        '{\"question\": \"exact question text\", \"subject\": \"subject name\", \"difficulty\": \"easy|medium|hard\"}\n'
        "If no clear question is found, set question to empty string."
    )

    try:
        vision_raw = await complete_with_vision(
            image_b64=image_b64,
            prompt=extraction_prompt,
            image_media_type=content_type,
            max_tokens=512,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Vision model error: {exc}",
        )

    # ── 5. Parse vision JSON ─────────────────────────────────────────────────
    try:
        vision_data = _extract_json_object(vision_raw)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse vision model response as JSON: {exc}",
        )

    detected_question: str = vision_data.get("question", "").strip()
    detected_subject: str = vision_data.get("subject", "General").strip()
    difficulty: str = vision_data.get("difficulty", "medium").strip().lower()

    if not detected_question:
        raise HTTPException(
            status_code=422,
            detail="No question could be extracted from the image. Please upload a clearer photo.",
        )

    # ── 6. Apply subject hint if user provided one and vision returned 'General'
    effective_subject = subject.strip() if subject.strip() else detected_subject
    if detected_subject.lower() == "general" and subject.strip():
        effective_subject = subject.strip()

    # Normalise difficulty
    if difficulty not in ("easy", "medium", "hard"):
        difficulty = "medium"

    # ── 7. Solving pass — step-by-step solution ──────────────────────────────
    system_prompt = (
        f"You are an expert {effective_subject} tutor. Solve this problem step by step."
    )

    user_message = (
        f"Problem: {detected_question}\n\n"
        "Return ONLY valid JSON:\n"
        "{\n"
        '  "solution_steps": [\n'
        '    {"step_number": 1, "description": "Clear explanation", '
        '"working": "equation/formula used", "note": "tip or warning or null"}\n'
        "  ],\n"
        '  "final_answer": "concise final answer",\n'
        '  "key_concepts": ["concept1", "concept2", "concept3"],\n'
        '  "common_mistakes": ["mistake1", "mistake2"],\n'
        '  "similar_questions": ["related practice question 1", "related practice question 2"]\n'
        "}"
    )

    try:
        solution_raw = await complete(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=2000,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Solver model error: {exc}",
        )

    # ── 8. Parse solution JSON ───────────────────────────────────────────────
    try:
        solution_data = _extract_json_object(solution_raw)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not parse solver response as JSON: {exc}",
        )

    # ── 9. Build & validate response ─────────────────────────────────────────
    raw_steps = solution_data.get("solution_steps", [])
    steps: List[SolutionStep] = []
    for i, s in enumerate(raw_steps):
        try:
            steps.append(
                SolutionStep(
                    step_number=s.get("step_number", i + 1),
                    description=s.get("description", ""),
                    working=s.get("working") or None,
                    note=s.get("note") or None,
                )
            )
        except Exception:
            continue  # skip malformed step

    if not steps:
        raise HTTPException(
            status_code=422,
            detail="Solver returned no solution steps. Please try again.",
        )

    return PhotoSolverResponse(
        detected_subject=effective_subject,
        detected_question=detected_question,
        difficulty=difficulty,
        solution_steps=steps,
        final_answer=solution_data.get("final_answer", "See steps above."),
        key_concepts=solution_data.get("key_concepts", []),
        common_mistakes=solution_data.get("common_mistakes", []),
        similar_questions=solution_data.get("similar_questions", []),
    )

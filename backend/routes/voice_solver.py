"""
Voice Solver Route
Accepts a spoken/typed transcript and returns a conversational explanation
suitable for text-to-speech playback.
"""
import re
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.llm import complete
from utils.json_helper import parse_json_safe as _parse_json_safe

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────


class SolveTextRequest(BaseModel):
    transcript: str
    language: str = "English"
    subject: str = "General"


class DetectLanguageRequest(BaseModel):
    transcript: str


class KeyTerm(BaseModel):
    term: str
    definition: str


class VoiceAnswerResponse(BaseModel):
    answer_text: str
    answer_short: str
    language: str
    subject: str
    key_terms: List[KeyTerm]
    follow_up_prompts: List[str]


class DetectLanguageResponse(BaseModel):
    language: str
    confidence: float


# ── Language detection heuristic ─────────────────────────────────────

# Unicode ranges for Indian scripts
_SCRIPT_RANGES = {
    "Tamil":     (0x0B80, 0x0BFF),
    "Hindi":     (0x0900, 0x097F),
    "Telugu":    (0x0C00, 0x0C7F),
    "Kannada":   (0x0C80, 0x0CFF),
    "Malayalam": (0x0D00, 0x0D7F),
}


def detect_language_heuristic(text: str) -> DetectLanguageResponse:
    """
    Detect language from a text string using Unicode block ranges.
    Returns the detected language name and a confidence score (0.0–1.0).
    """
    if not text:
        return DetectLanguageResponse(language="English", confidence=1.0)

    total_chars = len(text)
    script_counts = {lang: 0 for lang in _SCRIPT_RANGES}

    for ch in text:
        cp = ord(ch)
        for lang, (lo, hi) in _SCRIPT_RANGES.items():
            if lo <= cp <= hi:
                script_counts[lang] += 1
                break

    # Find language with highest character count
    max_lang = max(script_counts, key=lambda k: script_counts[k])
    max_count = script_counts[max_lang]

    if max_count == 0:
        return DetectLanguageResponse(language="English", confidence=0.95)

    confidence = min(max_count / max(total_chars, 1), 1.0)
    return DetectLanguageResponse(language=max_lang, confidence=round(confidence, 3))


# ── Endpoints ─────────────────────────────────────────────────────────


@router.post("/solve-text", response_model=VoiceAnswerResponse)
async def solve_text(request: SolveTextRequest):
    """
    Accept a spoken/typed question transcript and return a conversational
    explanation suitable for TTS playback, key terms, and follow-up prompts.
    """
    transcript = request.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript cannot be empty.")
    if len(transcript) > 2000:
        raise HTTPException(status_code=400, detail="Transcript is too long (max 2000 characters).")

    language = request.language.strip() or "English"
    subject = request.subject.strip() or "General"

    system_prompt = (
        f"You are a friendly academic tutor who explains concepts clearly and conversationally. "
        f"The student asked in {language}. Answer in the SAME language as the question. "
        f"Keep sentences under 20 words. No markdown formatting — this answer will be read aloud. "
        f"Subject: {subject}."
    )

    user_message = (
        f'Student asked: "{transcript}"\n\n'
        f"Return ONLY valid JSON:\n"
        "{\n"
        f'  "answer_text": "full conversational explanation in {language} (4-6 sentences)",\n'
        f'  "answer_short": "2-sentence TTS-friendly summary in {language}",\n'
        '  "subject": "detected subject",\n'
        '  "key_terms": [{"term": "...", "definition": "simple definition"}],\n'
        '  "follow_up_prompts": ["question1", "question2", "question3"]\n'
        "}"
    )

    try:
        raw = await complete(
            system_prompt=system_prompt,
            user_message=user_message,
            max_tokens=1200,
            temperature=0.6,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM call failed: {str(e)}")

    data = _parse_json_safe(raw)

    if not data:
        raise HTTPException(status_code=502, detail="AI returned a malformed response. Please retry.")

    answer_text = data.get("answer_text", "").strip()
    answer_short = data.get("answer_short", "").strip()
    detected_subject = data.get("subject", subject).strip() or subject

    # Safely parse key_terms
    raw_key_terms = data.get("key_terms", [])
    key_terms: List[KeyTerm] = []
    if isinstance(raw_key_terms, list):
        for kt in raw_key_terms:
            if isinstance(kt, dict) and "term" in kt and "definition" in kt:
                key_terms.append(KeyTerm(term=str(kt["term"]), definition=str(kt["definition"])))

    # Safely parse follow-up prompts
    raw_follow_ups = data.get("follow_up_prompts", [])
    follow_up_prompts: List[str] = []
    if isinstance(raw_follow_ups, list):
        for fp in raw_follow_ups:
            if isinstance(fp, str) and fp.strip():
                follow_up_prompts.append(fp.strip())
    follow_up_prompts = follow_up_prompts[:3]

    if not answer_text:
        raise HTTPException(status_code=502, detail="AI returned an empty answer. Please retry.")

    return VoiceAnswerResponse(
        answer_text=answer_text,
        answer_short=answer_short or answer_text[:200],
        language=language,
        subject=detected_subject,
        key_terms=key_terms,
        follow_up_prompts=follow_up_prompts,
    )


@router.post("/detect-language", response_model=DetectLanguageResponse)
async def detect_language(request: DetectLanguageRequest):
    """
    Detect the language of a transcript using Unicode heuristics.
    No LLM is used — runs instantly.
    """
    return detect_language_heuristic(request.transcript)

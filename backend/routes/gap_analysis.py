"""
PYQ Gap Analysis Route
Analyzes previous year question papers against a syllabus to identify
topic frequency, priority scores, and study recommendations.
"""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Form, HTTPException, UploadFile, File
from pydantic import BaseModel

from services.firebase import get_db
from services.llm import complete
from services.rag import extract_text_from_pdf_bytes
from utils.json_helper import parse_json_safe

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────


class TopicGap(BaseModel):
    topic: str
    unit: str
    frequency: int
    years_appeared: List[str]
    priority: str          # critical | high | medium | low | skip
    priority_score: int    # 0-100
    study_hours_suggested: float
    action: str


class GapAnalysisResult(BaseModel):
    analysis_id: str
    subject: str
    years_analyzed: int
    total_topics: int
    critical_topics: List[TopicGap]
    high_topics: List[TopicGap]
    medium_topics: List[TopicGap]
    low_topics: List[TopicGap]
    skip_topics: List[TopicGap]
    never_appeared: List[str]
    coverage_percentage: float
    study_plan_hours: dict
    insights: List[str]


# ── Helpers ───────────────────────────────────────────────────────────


def clean_text(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compute_priority(frequency: int, years_appeared: List[str], current_year: int) -> dict:
    """Return priority label, score, study hours, and action string."""
    frequency_score = min(frequency * 15, 50)

    recent_years = {str(current_year - 1), str(current_year - 2)}
    recency_score = 25 if any(y in recent_years for y in years_appeared) else 10

    total_score = frequency_score + recency_score

    if total_score >= 60:
        priority = "critical"
        hours = 3.0
        action = "Study deeply — this topic appears very frequently and recently. Prioritize for exam."
    elif total_score >= 40:
        priority = "high"
        hours = 2.0
        action = "Focus heavily — high recurrence in PYQs. Make detailed notes and practice questions."
    elif total_score >= 20:
        priority = "medium"
        hours = 1.0
        action = "Cover with moderate depth — appears occasionally. Understand core concepts."
    elif total_score >= 5:
        priority = "low"
        hours = 0.5
        action = "Quick read only — rarely appears but still in syllabus. Skim main definitions."
    else:
        priority = "skip"
        hours = 0.0
        action = "Safe to skip — never appeared in PYQs and low syllabus weight. Use time elsewhere."

    return {
        "priority": priority,
        "priority_score": total_score,
        "study_hours_suggested": hours,
        "action": action,
    }


# ── Endpoints ─────────────────────────────────────────────────────────


@router.post("/analyze", response_model=GapAnalysisResult)
async def analyze_gap(
    pyq_files: List[UploadFile] = File(...),
    syllabus_file: UploadFile = File(...),
    subject: str = Form(...),
    years_covered: int = Form(default=3),
):
    """
    Accepts multiple PYQ PDFs + one syllabus PDF.
    Returns a full gap analysis with topic priorities and study recommendations.
    """
    if not pyq_files:
        raise HTTPException(status_code=400, detail="At least one PYQ PDF is required.")

    # ── Step 1: Extract PYQ text ──────────────────────────────────────
    pyq_texts = []
    for f in pyq_files:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"'{f.filename}' is not a PDF. Only PDF files are accepted.",
            )
        content = await f.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"'{f.filename}' exceeds the 20 MB limit.")
        try:
            text = extract_text_from_pdf_bytes(content)
            if text.strip():
                pyq_texts.append(f"=== PYQ FILE: {f.filename} ===\n{text}")
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    if not pyq_texts:
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from the PYQ PDFs. Ensure they are not scanned images.",
        )

    # ── Step 2: Extract syllabus text ─────────────────────────────────
    if not syllabus_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Syllabus file must be a PDF.")
    syllabus_bytes = await syllabus_file.read()
    try:
        syllabus_text = extract_text_from_pdf_bytes(syllabus_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Syllabus extraction failed: {str(e)}")

    if not syllabus_text.strip():
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from the syllabus PDF. Ensure it is not a scanned image.",
        )

    pyq_combined = clean_text("\n\n".join(pyq_texts))
    syllabus_text = clean_text(syllabus_text)

    # ── Step 3: LLM Call 1 — Parse syllabus into structured topics ────
    try:
        syllabus_raw = await complete(
            system_prompt=(
                "You are an expert academic syllabus parser. "
                "Your job is to extract every distinct topic and sub-topic from a syllabus, organized by unit. "
                "Each topic should be a clear, concise concept name (2-6 words), not a full sentence. "
                "Return ONLY valid JSON with no markdown, no explanation, no preamble."
            ),
            user_message=(
                f"{syllabus_text[:8000]}\n\n"
                "Parse the above syllabus and extract ALL topics organized by unit.\n"
                "Rules:\n"
                "- Each unit_name should be the exact heading from the syllabus (e.g. 'Unit 1: Introduction to OS')\n"
                "- Each topic should be a clear concept name, not a sentence\n"
                "- Include sub-topics as separate items\n"
                "- Do not merge or skip topics\n"
                'Return ONLY JSON: {"units": [{"unit_name": "Unit 1: ...", "topics": ["topic1", "topic2", "topic3"]}]}'
            ),
            max_tokens=1500,
            temperature=0.1,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Syllabus parsing LLM call failed: {str(e)}")

    syllabus_data = parse_json_safe(syllabus_raw)
    units = syllabus_data.get("units", [])

    if not units:
        raise HTTPException(
            status_code=502,
            detail="Could not parse syllabus structure. Please retry.",
        )

    # Build flat topic list with unit tags
    all_topics_list = []
    topic_unit_map = {}
    for unit in units:
        unit_name = unit.get("unit_name", "Unknown Unit")
        for topic in unit.get("topics", []):
            all_topics_list.append({"topic": topic, "unit": unit_name})
            topic_unit_map[topic] = unit_name

    if not all_topics_list:
        raise HTTPException(status_code=502, detail="No topics found in syllabus. Please retry.")

    # ── Step 4: LLM Call 2 — Map topics to PYQ content ───────────────
    topics_str = json.dumps(all_topics_list[:80], ensure_ascii=False)  # limit to avoid token overflow

    try:
        mapping_raw = await complete(
            system_prompt=(
                f"You are a senior {subject} exam analyst. "
                "You will be given a list of syllabus topics and a collection of previous year question paper text. "
                "Your task is to carefully read every question in the PYQ text and count how many questions test each topic. "
                "Use SEMANTIC understanding — a question about 'Dijkstra's algorithm' counts for 'Shortest path algorithms'. "
                "A question on 'Newton's second law' counts for 'Laws of motion'. "
                "Be thorough — go through every question. "
                "Return ONLY valid JSON, no markdown, no explanation."
            ),
            user_message=(
                f"Syllabus topics to analyze:\n{topics_str}\n\n"
                f"Previous Year Question Papers ({years_covered} years):\n{pyq_combined[:12000]}\n\n"
                "Instructions:\n"
                "1. Read every question in the PYQ text above\n"
                "2. For each syllabus topic, count how many distinct questions relate to it (use semantic understanding)\n"
                "3. Note which years each topic appeared in (look for year headers or file names in the PYQ text)\n"
                "4. Include ALL topics from the list — set frequency to 0 if a topic never appeared\n"
                "5. Be generous with semantic matching: related, applied, or indirect questions still count\n"
                'Return ONLY JSON: {"topic_analysis": [{"topic": "...", "unit": "...", "frequency": N, "years_appeared": ["2023","2022"]}]}'
            ),
            max_tokens=2500,
            temperature=0.1,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Topic mapping LLM call failed: {str(e)}")

    mapping_data = parse_json_safe(mapping_raw)
    topic_analysis = mapping_data.get("topic_analysis", [])

    # ── Step 5: Compute priority scores ───────────────────────────────
    current_year = datetime.now(timezone.utc).year

    # Index by topic name for quick lookup
    analyzed_topic_names = set()
    topic_gaps: List[TopicGap] = []

    for item in topic_analysis:
        topic_name = item.get("topic", "").strip()
        if not topic_name:
            continue
        analyzed_topic_names.add(topic_name)

        unit = item.get("unit") or topic_unit_map.get(topic_name, "Unknown Unit")
        frequency = max(0, int(item.get("frequency", 0)))
        years_appeared = [str(y) for y in item.get("years_appeared", [])]

        p = compute_priority(frequency, years_appeared, current_year)

        topic_gaps.append(
            TopicGap(
                topic=topic_name,
                unit=unit,
                frequency=frequency,
                years_appeared=years_appeared,
                priority=p["priority"],
                priority_score=p["priority_score"],
                study_hours_suggested=p["study_hours_suggested"],
                action=p["action"],
            )
        )

    # Topics in syllabus that never appeared in PYQs
    all_syllabus_topics = {t["topic"] for t in all_topics_list}
    never_appeared = sorted(all_syllabus_topics - analyzed_topic_names)

    # Add never-appeared topics as "skip" with score 0
    for topic_name in never_appeared:
        unit = topic_unit_map.get(topic_name, "Unknown Unit")
        p = compute_priority(0, [], current_year)
        topic_gaps.append(
            TopicGap(
                topic=topic_name,
                unit=unit,
                frequency=0,
                years_appeared=[],
                priority=p["priority"],
                priority_score=p["priority_score"],
                study_hours_suggested=p["study_hours_suggested"],
                action=p["action"],
            )
        )

    # Sort by priority score descending
    topic_gaps.sort(key=lambda t: t.priority_score, reverse=True)

    critical_topics = [t for t in topic_gaps if t.priority == "critical"]
    high_topics = [t for t in topic_gaps if t.priority == "high"]
    medium_topics = [t for t in topic_gaps if t.priority == "medium"]
    low_topics = [t for t in topic_gaps if t.priority == "low"]
    skip_topics = [t for t in topic_gaps if t.priority == "skip"]

    # Coverage: topics that appeared at least once / total syllabus topics
    appeared_count = sum(1 for t in topic_gaps if t.frequency > 0)
    total_topics = len(topic_gaps)
    coverage_pct = (appeared_count / total_topics * 100) if total_topics > 0 else 0.0

    # Study plan hours summary
    study_plan_hours = {
        "critical": round(sum(t.study_hours_suggested for t in critical_topics), 1),
        "high": round(sum(t.study_hours_suggested for t in high_topics), 1),
        "medium": round(sum(t.study_hours_suggested for t in medium_topics), 1),
        "low": round(sum(t.study_hours_suggested for t in low_topics), 1),
        "total": round(sum(t.study_hours_suggested for t in topic_gaps), 1),
    }

    # ── Step 6: LLM Call 3 — Generate insights ────────────────────────
    critical_names = [t.topic for t in critical_topics[:8]]
    insights_user = (
        f"Subject: {subject}, Years analyzed: {years_covered}\n"
        f"Critical topics: {critical_names}\n"
        f"Never appeared in PYQs: {never_appeared[:10]}\n"
        f"Coverage: {coverage_pct:.1f}%\n"
        f"Total topics: {total_topics}\n\n"
        "Generate 4 specific, actionable insights about exam patterns for this subject. "
        'Return ONLY JSON: {"insights": ["insight1", "insight2", "insight3", "insight4"]}'
    )

    try:
        insights_raw = await complete(
            system_prompt=(
                f"You are an expert academic exam coach analyzing {subject} question paper patterns. "
                "Give precise, helpful insights based on the data. No markdown."
            ),
            user_message=insights_user,
            max_tokens=800,
            temperature=0.5,
        )
        insights_data = parse_json_safe(insights_raw)
        insights = insights_data.get("insights", [])
    except Exception:
        insights = [
            f"Focus on {critical_names[0] if critical_names else 'core topics'} — it's the highest priority.",
            f"Coverage is {coverage_pct:.1f}% — {len(never_appeared)} syllabus topics have never appeared.",
            f"Allocate {study_plan_hours['total']} total study hours based on priority analysis.",
            "Review the last 2 years' papers first — recency boosts your priority score.",
        ]

    if not insights:
        insights = [
            f"Focus on {critical_names[0] if critical_names else 'core topics'} — highest frequency.",
            f"{len(never_appeared)} syllabus topics have never appeared in PYQs.",
            f"Total recommended study time: {study_plan_hours['total']} hours.",
            "Prioritize topics from the last 2 years for maximum exam impact.",
        ]

    # ── Step 7: Store in Firestore ────────────────────────────────────
    analysis_id = str(uuid.uuid4())

    record = {
        "analysis_id": analysis_id,
        "subject": subject,
        "years_analyzed": years_covered,
        "total_topics": total_topics,
        "critical_topics": [t.model_dump() for t in critical_topics],
        "high_topics": [t.model_dump() for t in high_topics],
        "medium_topics": [t.model_dump() for t in medium_topics],
        "low_topics": [t.model_dump() for t in low_topics],
        "skip_topics": [t.model_dump() for t in skip_topics],
        "never_appeared": never_appeared,
        "coverage_percentage": round(coverage_pct, 2),
        "study_plan_hours": study_plan_hours,
        "insights": insights,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        db = get_db()
        db.collection("gap_analyses").document(analysis_id).set(record)
    except Exception as e:
        # Log but don't fail the request — return result even if Firestore fails
        print(f"[gap_analysis] Firestore write failed: {e}")

    # ── Step 8: Return result ─────────────────────────────────────────
    return GapAnalysisResult(
        analysis_id=analysis_id,
        subject=subject,
        years_analyzed=years_covered,
        total_topics=total_topics,
        critical_topics=critical_topics,
        high_topics=high_topics,
        medium_topics=medium_topics,
        low_topics=low_topics,
        skip_topics=skip_topics,
        never_appeared=never_appeared,
        coverage_percentage=round(coverage_pct, 2),
        study_plan_hours=study_plan_hours,
        insights=insights,
    )


@router.get("/{analysis_id}", response_model=GapAnalysisResult)
async def get_gap_analysis(analysis_id: str):
    """Fetch a previously computed gap analysis from Firestore by its ID."""
    try:
        db = get_db()
        doc = db.collection("gap_analyses").document(analysis_id).get()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Firestore error: {str(e)}")

    if not doc.exists:
        raise HTTPException(status_code=404, detail=f"Analysis '{analysis_id}' not found.")

    data = doc.to_dict()

    return GapAnalysisResult(
        analysis_id=data.get("analysis_id", analysis_id),
        subject=data.get("subject", ""),
        years_analyzed=data.get("years_analyzed", 0),
        total_topics=data.get("total_topics", 0),
        critical_topics=[TopicGap(**t) for t in data.get("critical_topics", [])],
        high_topics=[TopicGap(**t) for t in data.get("high_topics", [])],
        medium_topics=[TopicGap(**t) for t in data.get("medium_topics", [])],
        low_topics=[TopicGap(**t) for t in data.get("low_topics", [])],
        skip_topics=[TopicGap(**t) for t in data.get("skip_topics", [])],
        never_appeared=data.get("never_appeared", []),
        coverage_percentage=data.get("coverage_percentage", 0.0),
        study_plan_hours=data.get("study_plan_hours", {}),
        insights=data.get("insights", []),
    )

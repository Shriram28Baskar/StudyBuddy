"""
Score Predictor — Predicts expected exam score based on study plan progress,
test performance, and days remaining, with LLM-generated topic-level insights.
"""
import json
import re
import traceback
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services import firebase
from services.llm import complete
from utils.json_helper import extract_json_object as _extract_json

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PredictRequest(BaseModel):
    plan_id: str
    exam_date: str          # ISO date string e.g. "2026-08-15"
    user_id: str


class TopicPrediction(BaseModel):
    topic: str
    current_mastery: int    # 0-100
    predicted_score: int    # 0-100
    weight: str             # high | medium | low
    action: str


class ScorePrediction(BaseModel):
    predicted_score: int
    confidence_low: int
    confidence_high: int
    grade_prediction: str   # O | A+ | A | B+ | B | C
    days_remaining: int
    completion_rate: float
    avg_test_score: float
    topic_predictions: List[TopicPrediction]
    critical_topics: List[str]
    skip_topics: List[str]
    daily_target: str
    motivation_message: str
    whatif_scenarios: List[dict]  # [{extra_hours: int, new_score: int}, ...]


# ---------------------------------------------------------------------------
# Core prediction algorithm
# ---------------------------------------------------------------------------

def compute_prediction(plan_data: dict, exam_date_str: str):
    """
    Returns (predicted_score, confidence_low, confidence_high,
             completion_pct, avg_test, days_left)
    """
    today = date.today()
    exam_date = date.fromisoformat(exam_date_str[:10])
    days_left = max(0, (exam_date - today).days)

    progress = plan_data.get("progress", {})
    completed_tasks = progress.get("completed_tasks", {})
    test_scores = progress.get("test_scores", [])

    done = sum(1 for v in completed_tasks.values() if v)
    total = len(completed_tasks)
    completion_score = (done / total * 100) if total > 0 else 50

    if test_scores:
        avg_test = (
            sum(
                s.get("score", 0) / max(s.get("total", 1), 1) * 100
                for s in test_scores
            )
            / len(test_scores)
        )
    else:
        avg_test = 50

    urgency_penalty = max(0, (30 - days_left) * 0.5) if completion_score < 60 else 0
    weak_count = len(progress.get("weak_topics", []))
    weak_penalty = weak_count * 3

    raw = (
        (completion_score * 0.4)
        + (avg_test * 0.6)
        - urgency_penalty
        - weak_penalty
    )
    predicted = max(30, min(98, raw))
    confidence_low = max(20, int(predicted) - 8)
    confidence_high = min(100, int(predicted) + 8)

    return (
        int(predicted),
        confidence_low,
        confidence_high,
        round(completion_score, 1),
        round(avg_test, 1),
        days_left,
    )


def map_grade(score: int) -> str:
    if score >= 90:
        return "O"
    elif score >= 80:
        return "A+"
    elif score >= 70:
        return "A"
    elif score >= 60:
        return "B+"
    elif score >= 50:
        return "B"
    else:
        return "C"


# ---------------------------------------------------------------------------
# LLM prompt builder
# ---------------------------------------------------------------------------

PREDICT_SYSTEM = """\
You are an expert exam prediction advisor for students.

Student data:
- Predicted score: {predicted}%
- Days remaining: {days_left}
- Weak topics: {weak_topics}
- Completion: {completion_pct:.1f}%
- Avg test score: {avg_test:.1f}%
- Study plan topic: {topic}

Generate the following fields for a comprehensive score prediction report.

Return ONLY valid JSON with exactly these keys:
{{
  "topic_predictions": [
    {{"topic": "string", "current_mastery": 0-100, "predicted_score": 0-100, "weight": "high|medium|low", "action": "string"}}
  ],
  "critical_topics": ["topic1", "topic2", "topic3"],
  "skip_topics": ["topic1"],
  "daily_target": "Study 3h/day on [specific topics]",
  "motivation_message": "One warm encouraging sentence.",
  "whatif_scenarios": [
    {{"extra_hours": 1, "new_score": X}},
    {{"extra_hours": 2, "new_score": Y}},
    {{"extra_hours": 3, "new_score": Z}}
  ]
}}

Rules:
- topic_predictions must have 3-5 entries based on the study plan topic
- critical_topics must have exactly 3 items
- skip_topics must have 1-2 items
- whatif new_score must increase by roughly 3-5 points per extra hour from the base predicted score of {predicted}%
- daily_target must be specific and actionable
- motivation_message must be warm and non-alarming
"""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/predict", response_model=ScorePrediction)
async def predict_score(req: PredictRequest):
    """
    Predict exam score for a given study plan and exam date.
    Combines algorithmic computation with LLM-generated topic insights.
    """
    try:
        db = firebase.get_db()
        doc = db.collection("studyPlans").document(req.plan_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Study plan not found")

        plan_data = doc.to_dict()
        topic = plan_data.get("topic", "General Studies")
        progress = plan_data.get("progress", {})
        weak_topics = progress.get("weak_topics", [])

        # Algorithmic prediction
        predicted, conf_low, conf_high, completion_pct, avg_test, days_left = compute_prediction(
            plan_data, req.exam_date
        )
        grade = map_grade(predicted)

        # Build what-if scenarios (fallback if LLM fails)
        fallback_whatif = [
            {"extra_hours": 1, "new_score": min(100, predicted + 4)},
            {"extra_hours": 2, "new_score": min(100, predicted + 8)},
            {"extra_hours": 3, "new_score": min(100, predicted + 11)},
        ]

        # LLM call for topic-level insights
        system_prompt = PREDICT_SYSTEM.format(
            predicted=predicted,
            days_left=days_left,
            weak_topics=", ".join(weak_topics) if weak_topics else "none identified",
            completion_pct=completion_pct,
            avg_test=avg_test,
            topic=topic,
        )

        llm_data: dict = {}
        try:
            raw = await complete(
                system_prompt=system_prompt,
                user_message=f"Generate score prediction for {topic} student",
                max_tokens=1200,
                temperature=0.5,
            )
            llm_data = _extract_json(raw)
        except Exception as llm_err:
            print(f"[score_predictor] LLM error: {llm_err}")
            llm_data = {}

        # Parse topic predictions
        raw_tp = llm_data.get("topic_predictions", [])
        topic_predictions: List[TopicPrediction] = []
        if isinstance(raw_tp, list):
            for item in raw_tp:
                if not isinstance(item, dict):
                    continue
                try:
                    topic_predictions.append(
                        TopicPrediction(
                            topic=str(item.get("topic", topic)),
                            current_mastery=max(0, min(100, int(item.get("current_mastery", 50)))),
                            predicted_score=max(0, min(100, int(item.get("predicted_score", predicted)))),
                            weight=str(item.get("weight", "medium")).lower()
                            if str(item.get("weight", "medium")).lower() in ("high", "medium", "low")
                            else "medium",
                            action=str(item.get("action", "Review and practice regularly")),
                        )
                    )
                except Exception:
                    continue

        # Fallback topic predictions if LLM didn't produce any
        if not topic_predictions:
            weeks = plan_data.get("weeks", [])
            seen = set()
            for week in weeks[:4]:
                for t in week.get("topics", []):
                    tname = t.get("name", topic)
                    if tname not in seen:
                        seen.add(tname)
                        mastery = max(30, predicted - 10) if tname in weak_topics else min(95, predicted + 5)
                        topic_predictions.append(
                            TopicPrediction(
                                topic=tname,
                                current_mastery=mastery,
                                predicted_score=min(100, mastery + 8),
                                weight=t.get("priority", "medium"),
                                action="Focus on practice problems and review key concepts",
                            )
                        )
            if not topic_predictions:
                topic_predictions.append(
                    TopicPrediction(
                        topic=topic,
                        current_mastery=max(30, predicted - 5),
                        predicted_score=predicted,
                        weight="high",
                        action="Study core concepts daily and take mock tests",
                    )
                )

        # Other LLM fields with fallbacks
        critical_topics = llm_data.get("critical_topics", weak_topics[:3] if weak_topics else [topic])
        if not isinstance(critical_topics, list) or not critical_topics:
            critical_topics = weak_topics[:3] if weak_topics else [topic]

        skip_topics = llm_data.get("skip_topics", [])
        if not isinstance(skip_topics, list):
            skip_topics = []

        daily_target = llm_data.get("daily_target", "")
        if not isinstance(daily_target, str) or not daily_target.strip():
            daily_target = f"Study 3h/day focusing on {', '.join(critical_topics[:2]) if critical_topics else topic}"

        motivation_message = llm_data.get("motivation_message", "")
        if not isinstance(motivation_message, str) or not motivation_message.strip():
            motivation_message = "You're making great progress — keep your momentum going and trust the process!"

        whatif_raw = llm_data.get("whatif_scenarios", [])
        whatif_scenarios = []
        if isinstance(whatif_raw, list) and len(whatif_raw) >= 3:
            for entry in whatif_raw[:3]:
                if isinstance(entry, dict):
                    try:
                        whatif_scenarios.append(
                            {
                                "extra_hours": int(entry.get("extra_hours", 1)),
                                "new_score": min(100, int(entry.get("new_score", predicted))),
                            }
                        )
                    except Exception:
                        pass
        if len(whatif_scenarios) < 3:
            whatif_scenarios = fallback_whatif

        return ScorePrediction(
            predicted_score=predicted,
            confidence_low=conf_low,
            confidence_high=conf_high,
            grade_prediction=grade,
            days_remaining=days_left,
            completion_rate=completion_pct,
            avg_test_score=avg_test,
            topic_predictions=topic_predictions,
            critical_topics=critical_topics[:3],
            skip_topics=skip_topics[:2],
            daily_target=daily_target,
            motivation_message=motivation_message,
            whatif_scenarios=whatif_scenarios,
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/whatif/{plan_id}")
async def whatif_scenarios(plan_id: str, extra_hours: int = Query(default=2, ge=0, le=10)):
    """
    Return what-if scenario scores for different extra study hours per day.
    Always returns 3 scenarios (extra_hours 1, 2, 3) plus the selected one.
    """
    try:
        db = firebase.get_db()
        doc = db.collection("studyPlans").document(plan_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Study plan not found")

        plan_data = doc.to_dict()

        # Use today as a proxy exam date if none is known — 30 days from now
        proxy_exam = (date.today() + timedelta(days=30)).isoformat()

        predicted, conf_low, conf_high, completion_pct, avg_test, days_left = compute_prediction(
            plan_data, proxy_exam
        )

        scenarios = [
            {"extra_hours": 1, "new_score": min(100, predicted + 4)},
            {"extra_hours": 2, "new_score": min(100, predicted + 8)},
            {"extra_hours": 3, "new_score": min(100, predicted + 11)},
        ]

        selected_score = min(100, predicted + extra_hours * 4)

        return {
            "plan_id": plan_id,
            "base_score": predicted,
            "extra_hours": extra_hours,
            "selected_score": selected_score,
            "scenarios": scenarios,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

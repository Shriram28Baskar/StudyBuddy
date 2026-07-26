"""
Burnout Detector — Analyzes study plan data across multiple plans to detect
burnout signals and generate actionable wellbeing recommendations.
"""
import json
import re
import traceback
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import firebase
from services.llm import complete
from utils.json_helper import extract_json_object as _extract_json

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    user_id: str
    plan_ids: Optional[List[str]] = None


class BurnoutSignal(BaseModel):
    signal: str
    severity: str       # low | medium | high
    description: str


class BurnoutReport(BaseModel):
    mental_load_score: int      # 0-100
    risk_level: str             # healthy | caution | warning | critical
    risk_color: str             # hex colour
    signals_detected: List[BurnoutSignal]
    completion_trend: str       # improving | stable | declining
    score_trend: str
    recommendations: List[str]
    affirmation: str
    suggested_break: Optional[str]
    analyzed_at: str


# ---------------------------------------------------------------------------
# JSON helper
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Signal detection
# ---------------------------------------------------------------------------

SIGNAL_WEIGHTS = {"high": 30, "medium": 20, "low": 10}

RISK_COLORS = {
    "healthy": "#5bff9b",
    "caution": "#ffdb5b",
    "warning": "#ff9b5b",
    "critical": "#ff5b5b",
}


def detect_signals(
    avg_test_score: float,
    completion_pct: float,
    weak_topics: List[str],
    test_scores: List[dict],
) -> List[BurnoutSignal]:
    signals: List[BurnoutSignal] = []

    # 1. Declining test scores — last 2 tests below 50 %
    if len(test_scores) >= 2:
        recent_two = test_scores[-2:]
        recent_avg = sum(
            s.get("score", 0) / max(s.get("total", 1), 1) * 100 for s in recent_two
        ) / 2
        if recent_avg < 50:
            signals.append(
                BurnoutSignal(
                    signal="declining_scores",
                    severity="medium",
                    description=(
                        f"Your last 2 test scores averaged {recent_avg:.0f}%. "
                        "This may indicate fatigue or concept gaps building up."
                    ),
                )
            )

    # 2. Low completion
    if completion_pct < 30:
        signals.append(
            BurnoutSignal(
                signal="low_completion",
                severity="medium",
                description=(
                    f"Only {completion_pct:.0f}% of study tasks have been completed. "
                    "Consistent avoidance can be an early sign of burnout."
                ),
            )
        )

    # 3. Many weak topics
    if len(weak_topics) >= 3:
        signals.append(
            BurnoutSignal(
                signal="many_weak_topics",
                severity="high",
                description=(
                    f"{len(weak_topics)} weak topics detected: "
                    f"{', '.join(weak_topics[:3])}. "
                    "Accumulating weak areas can create mental overload."
                ),
            )
        )

    # 4. No progress at all
    if not test_scores:
        signals.append(
            BurnoutSignal(
                signal="no_progress",
                severity="low",
                description=(
                    "No test scores have been recorded yet. "
                    "Starting with a small weekly quiz can help track momentum."
                ),
            )
        )

    return signals


def compute_mental_load(signals: List[BurnoutSignal]) -> int:
    total = sum(SIGNAL_WEIGHTS.get(s.severity, 10) for s in signals)
    return min(100, total)


def compute_risk_level(score: int) -> str:
    if score < 30:
        return "healthy"
    elif score < 50:
        return "caution"
    elif score < 70:
        return "warning"
    else:
        return "critical"


def compute_trend(values: List[float]) -> str:
    """Compare first-half average vs second-half average."""
    if len(values) < 2:
        return "stable"
    mid = len(values) // 2
    first_half = sum(values[:mid]) / max(len(values[:mid]), 1)
    second_half = sum(values[mid:]) / max(len(values[mid:]), 1)
    diff = second_half - first_half
    if diff > 5:
        return "improving"
    elif diff < -5:
        return "declining"
    else:
        return "stable"


# ---------------------------------------------------------------------------
# LLM prompt
# ---------------------------------------------------------------------------

BURNOUT_SYSTEM = """\
You are a compassionate student wellbeing advisor analyzing burnout risk data.

Student burnout analysis:
- mental_load_score: {score}/100
- risk_level: {risk_level}
- signals detected: {signal_names}
- weak topics: {weak_topics}
- completion trend: {completion_trend}
- score trend: {score_trend}

Generate:
1. recommendations: exactly 4 specific, actionable strings (avoid generic advice like "take breaks")
2. affirmation: one warm, non-alarming sentence that acknowledges effort
3. suggested_break: null if risk is healthy, otherwise a specific string like "Consider taking this Sunday off for a guilt-free rest day"

Return ONLY valid JSON with exactly these keys:
{{
  "recommendations": ["string1", "string2", "string3", "string4"],
  "affirmation": "string",
  "suggested_break": null or "string"
}}
"""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/analyze", response_model=BurnoutReport)
async def analyze_burnout(req: AnalyzeRequest):
    """
    Analyze a user's study plans for burnout signals and generate a
    comprehensive wellbeing report with LLM recommendations.
    """
    try:
        db = firebase.get_db()

        # Fetch plans
        if req.plan_ids:
            docs = [
                db.collection("studyPlans").document(pid).get()
                for pid in req.plan_ids
            ]
            plans = [{"id": d.id, **d.to_dict()} for d in docs if d.exists]
        else:
            stream = (
                db.collection("studyPlans")
                .where("user_id", "==", req.user_id)
                .stream()
            )
            plans = [{"id": d.id, **d.to_dict()} for d in stream]

        if not plans:
            # Return a healthy report if no plans exist
            now_str = datetime.now(timezone.utc).isoformat()
            return BurnoutReport(
                mental_load_score=0,
                risk_level="healthy",
                risk_color=RISK_COLORS["healthy"],
                signals_detected=[],
                completion_trend="stable",
                score_trend="stable",
                recommendations=[
                    "Create your first study plan to begin tracking progress",
                    "Set a consistent daily study schedule of 2-3 hours",
                    "Take a diagnostic quiz to identify your starting level",
                    "Join a study group or community for accountability",
                ],
                affirmation="Every great journey starts with a single step — you're already here, which shows commitment!",
                suggested_break=None,
                analyzed_at=now_str,
            )

        # Aggregate stats across all plans
        all_test_scores: List[dict] = []
        all_completion_pcts: List[float] = []
        all_weak_topics: List[str] = []

        for plan in plans:
            progress = plan.get("progress", {})
            test_scores = progress.get("test_scores", [])
            all_test_scores.extend(test_scores)

            completed_tasks = progress.get("completed_tasks", {})
            done = sum(1 for v in completed_tasks.values() if v)
            total = len(completed_tasks)
            if total > 0:
                all_completion_pcts.append(done / total * 100)

            for wt in progress.get("weak_topics", []):
                if wt not in all_weak_topics:
                    all_weak_topics.append(wt)

        # Compute aggregate averages
        avg_completion = (
            sum(all_completion_pcts) / len(all_completion_pcts)
            if all_completion_pcts
            else 0.0
        )
        if all_test_scores:
            avg_test_score = (
                sum(
                    s.get("score", 0) / max(s.get("total", 1), 1) * 100
                    for s in all_test_scores
                )
                / len(all_test_scores)
            )
        else:
            avg_test_score = 0.0

        # Detect signals
        signals = detect_signals(avg_test_score, avg_completion, all_weak_topics, all_test_scores)
        mental_load = compute_mental_load(signals)
        risk_level = compute_risk_level(mental_load)
        risk_color = RISK_COLORS.get(risk_level, "#5bff9b")

        # Compute trends
        test_score_values = [
            s.get("score", 0) / max(s.get("total", 1), 1) * 100 for s in all_test_scores
        ]
        score_trend = compute_trend(test_score_values)
        completion_trend = compute_trend(all_completion_pcts)

        # LLM recommendations
        signal_names = (
            ", ".join(s.signal for s in signals) if signals else "none"
        )
        system_prompt = BURNOUT_SYSTEM.format(
            score=mental_load,
            risk_level=risk_level,
            signal_names=signal_names,
            weak_topics=", ".join(all_weak_topics[:5]) if all_weak_topics else "none",
            completion_trend=completion_trend,
            score_trend=score_trend,
        )

        llm_data: dict = {}
        try:
            raw = await complete(
                system_prompt=system_prompt,
                user_message="Generate burnout analysis recommendations",
                max_tokens=800,
                temperature=0.6,
            )
            llm_data = _extract_json(raw)
        except Exception as llm_err:
            print(f"[burnout_detector] LLM error: {llm_err}")
            llm_data = {}

        # Parse LLM output with fallbacks
        recommendations = llm_data.get("recommendations", [])
        if not isinstance(recommendations, list) or len(recommendations) < 4:
            recommendations = [
                f"Spend 20 minutes reviewing {all_weak_topics[0]} each morning"
                if all_weak_topics
                else "Create a focused 20-minute daily review session",
                "Use the Pomodoro technique: 25 min study, 5 min break — repeat 4 cycles",
                "Take a 5-question self-quiz at the end of each study session to reinforce memory",
                "Sleep 7-8 hours consistently — memory consolidation happens during sleep",
            ]

        affirmation = llm_data.get("affirmation", "")
        if not isinstance(affirmation, str) or not affirmation.strip():
            affirmation = (
                "You're putting in real effort, and that dedication will compound into success — keep going!"
            )

        suggested_break = llm_data.get("suggested_break", None)
        if suggested_break is not None and not isinstance(suggested_break, str):
            suggested_break = None
        if risk_level in ("warning", "critical") and not suggested_break:
            suggested_break = "Consider taking this Sunday off for a guilt-free rest day to recharge."

        # Save report to Firestore
        now_str = datetime.now(timezone.utc).isoformat()
        week_num = datetime.now(timezone.utc).isocalendar()[1]

        report_data = {
            "user_id": req.user_id,
            "mental_load_score": mental_load,
            "risk_level": risk_level,
            "risk_color": risk_color,
            "signals_detected": [s.model_dump() for s in signals],
            "completion_trend": completion_trend,
            "score_trend": score_trend,
            "recommendations": recommendations[:4],
            "affirmation": affirmation,
            "suggested_break": suggested_break,
            "analyzed_at": now_str,
        }

        try:
            db.collection("burnout_reports").document(
                f"{req.user_id}_{week_num}"
            ).set(report_data)
        except Exception as save_err:
            print(f"[burnout_detector] Failed to save report: {save_err}")

        return BurnoutReport(
            mental_load_score=mental_load,
            risk_level=risk_level,
            risk_color=risk_color,
            signals_detected=signals,
            completion_trend=completion_trend,
            score_trend=score_trend,
            recommendations=recommendations[:4],
            affirmation=affirmation,
            suggested_break=suggested_break,
            analyzed_at=now_str,
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/{user_id}", response_model=BurnoutReport)
async def get_last_report(user_id: str):
    """
    Retrieve the most recent burnout report stored for a user.
    Returns 404 if no report has been generated yet.
    """
    try:
        db = firebase.get_db()
        week_num = datetime.now(timezone.utc).isocalendar()[1]

        # Try current week first, then previous week
        for wn in (week_num, week_num - 1):
            doc = db.collection("burnout_reports").document(f"{user_id}_{wn}").get()
            if doc.exists:
                data = doc.to_dict()
                # Reconstruct BurnoutReport from stored data
                signals = [
                    BurnoutSignal(**s)
                    for s in data.get("signals_detected", [])
                    if isinstance(s, dict)
                ]
                return BurnoutReport(
                    mental_load_score=data.get("mental_load_score", 0),
                    risk_level=data.get("risk_level", "healthy"),
                    risk_color=data.get("risk_color", RISK_COLORS["healthy"]),
                    signals_detected=signals,
                    completion_trend=data.get("completion_trend", "stable"),
                    score_trend=data.get("score_trend", "stable"),
                    recommendations=data.get("recommendations", []),
                    affirmation=data.get("affirmation", ""),
                    suggested_break=data.get("suggested_break"),
                    analyzed_at=data.get("analyzed_at", ""),
                )

        raise HTTPException(
            status_code=404,
            detail="No burnout report found for this user. Run an analysis first.",
        )

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

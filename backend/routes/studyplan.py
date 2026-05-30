import json
from datetime import date
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from models.studyplan import DayPlan, StudyPlanRequest, StudyPlanResponse, Task
from services.llm import build_studyplan_prompt, complete, parse_json_response

router = APIRouter()


def _days_until_exam(exam_date: date) -> int:
    days = (exam_date - date.today()).days
    if days < 0:
        raise HTTPException(status_code=400, detail="Exam date cannot be in the past.")
    return max(days, 1)


def _clean_text(value, fallback: str) -> str:
    text = str(value or "").strip()
    return text or fallback


def _coerce_hours(value, fallback: float) -> float:
    try:
        hours = float(value)
    except (TypeError, ValueError):
        hours = fallback
    return round(max(hours, 0.25), 2)


def _normalize_tasks(
    tasks,
    subjects: List[str],
    hours_per_day: float,
    day_index: int,
) -> List[Task]:
    if not isinstance(tasks, list):
        tasks = []

    num_subjects = max(len(subjects), 1)
    default_hours = round(hours_per_day / num_subjects, 2)

    normalized: List[Task] = []
    for idx, item in enumerate(tasks):
        if isinstance(item, dict):
            subject = _clean_text(
                item.get("subject"),
                subjects[(day_index + idx) % len(subjects)],
            )
            topic = _clean_text(item.get("topic"), "Focused study session")
            hours = _coerce_hours(item.get("hours"), default_hours)
        else:
            subject = subjects[(day_index + idx) % len(subjects)]
            topic = _clean_text(item, "Focused study session")
            hours = default_hours
        normalized.append(Task(subject=subject, topic=topic, hours=hours))

    # Fallback: generate one task per subject if nothing came back
    if not normalized:
        normalized = [
            Task(
                subject=subject,
                topic=f"{subject} fundamentals and practice",
                hours=default_hours,
            )
            for subject in subjects
        ]

    # Scale tasks so total hours == hours_per_day
    current_total = sum(task.hours for task in normalized)
    if current_total > 0:
        scale = hours_per_day / current_total
        adjusted = [
            task.model_copy(update={"hours": round(max(task.hours * scale, 0.25), 2)})
            for task in normalized
        ]
        # Fix floating-point drift on the last task
        drift = round(hours_per_day - sum(t.hours for t in adjusted), 2)
        if adjusted and abs(drift) >= 0.01:
            last = adjusted[-1]
            adjusted[-1] = last.model_copy(
                update={"hours": round(max(last.hours + drift, 0.25), 2)}
            )
        normalized = adjusted

    return normalized


def _normalize_plan(data: dict, req: StudyPlanRequest, days: int) -> StudyPlanResponse:
    raw_plan = data.get("plan") if isinstance(data, dict) else None
    if not isinstance(raw_plan, list):
        raw_plan = []

    normalized_days: List[DayPlan] = []
    for idx in range(days):
        item = (
            raw_plan[idx]
            if idx < len(raw_plan) and isinstance(raw_plan[idx], dict)
            else {}
        )
        normalized_days.append(
            DayPlan(
                day=_clean_text(item.get("day"), f"Day {idx + 1}"),
                date=_clean_text(item.get("date"), f"Day {idx + 1}"),
                tasks=_normalize_tasks(
                    item.get("tasks"),
                    req.subjects,
                    req.hours_per_day,
                    idx,
                ),
            )
        )

    summary = _clean_text(
        data.get("summary") if isinstance(data, dict) else "",
        f"{days}-day plan for {req.exam}, balanced across {', '.join(req.subjects)}.",
    )
    return StudyPlanResponse(plan=normalized_days, summary=summary)


@router.post("", response_model=StudyPlanResponse)
async def generate_study_plan(req: StudyPlanRequest):
    days = _days_until_exam(req.exam_date)
    days = min(days, 90)

    prompt = build_studyplan_prompt(req.exam, req.subjects, req.hours_per_day, days)
    raw = await complete(
        system_prompt=prompt,
        user_message=f"Generate a structured {days}-day study plan for {req.exam}.",
        max_tokens=min(4000, 900 + days * 90),
        temperature=0.35,
    )

    parsed = parse_json_response(raw)
    if parsed is None:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=502,
                detail="AI returned an invalid study plan format.",
            ) from exc

    try:
        return _normalize_plan(parsed, req, days)
    except (ValidationError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="AI returned an incomplete study plan format.",
        ) from exc
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import traceback

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services import firebase

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ProgressUpdate(BaseModel):
    completed_tasks: Dict[str, bool] = Field(default_factory=dict)
    test_scores: List[Dict[str, Any]] = Field(default_factory=list)
    completion_percentage: Optional[float] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_doc_or_404(db, plan_id: str):
    """Fetch a Firestore document or raise 404."""
    doc = db.collection("studyPlans").document(plan_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Plan not found")
    return doc


def _count_tasks_in_weeks(weeks: list) -> int:
    """Count total tasks across all weeks."""
    return sum(
        len(tasks)
        for week in weeks
        for tasks in week.get("daily_tasks", {}).values()
        if isinstance(tasks, list)
    )


def _compute_completion(
    merged_tasks: Dict[str, bool],
    weeks: list,
    total_tasks: int,
) -> float:
    """Return completion percentage based on merged_tasks."""
    if total_tasks > 0:
        completed = sum(1 for v in merged_tasks.values() if v)
        return (completed / total_tasks) * 100

    # Fall back to iterating weeks when total_tasks is unknown
    total = done = 0
    for week_idx, week in enumerate(weeks):
        for day, tasks in week.get("daily_tasks", {}).items():
            for task_idx in range(len(tasks)):
                total += 1
                key = f"w{week_idx}_{day}_{task_idx}"
                if merged_tasks.get(key, False):
                    done += 1
    return (done / total * 100) if total else 0.0


def _merge_test_scores(
    existing: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge test scores, replacing existing entries for the same week."""
    score_map = {s.get("week"): s for s in existing}
    for score in incoming:
        score_map[score.get("week")] = score
    return list(score_map.values())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/study-plans")
async def get_user_plans(user_id: str = Query(...)):
    """Get all study plans for a user."""
    try:
        db = firebase.get_db()
        docs = (
            db.collection("studyPlans")
            .where("user_id", "==", user_id)
            .stream()
        )

        plans = []
        for doc in docs:
            data = doc.to_dict()
            prog = data.get("progress", {})
            plans.append({
                "id": doc.id,
                "topic": data.get("topic", ""),
                "duration_weeks": data.get("duration_weeks", 0),
                "created_at": data.get("created_at", ""),
                "completion_percentage": prog.get(
                    "completion_percentage",
                    prog.get("completion_pct", 0),
                ),
                "test_scores": prog.get("test_scores", []),
                "weeks_count": len(data.get("weeks", [])),
            })

        # Sort in memory — avoids composite Firestore index requirement
        plans.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return {"plans": plans}

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/study-plans/{plan_id}")
async def get_plan_details(plan_id: str):
    """Get full plan details by ID."""
    try:
        db = firebase.get_db()
        doc = _get_doc_or_404(db, plan_id)
        data = doc.to_dict()
        weeks = data.get("weeks", [])

        return {
            "id": doc.id,
            "topic": data.get("topic", ""),
            "duration_weeks": data.get("duration_weeks", 0),
            "created_at": data.get("created_at", ""),
            "weeks": weeks,
            "progress": data.get("progress", {
                "completed_tasks": {},
                "test_scores": [],
                "completion_percentage": 0.0,
            }),
            "total_tasks": data.get("total_tasks") or _count_tasks_in_weeks(weeks),
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/study-plans/{plan_id}/progress")
async def update_plan_progress(plan_id: str, update: ProgressUpdate):
    """Update tasks and test scores — MERGE, not overwrite."""
    try:
        db = firebase.get_db()
        ref = db.collection("studyPlans").document(plan_id)
        doc = _get_doc_or_404(db, plan_id)

        data = doc.to_dict()
        progress = data.get("progress", {})
        weeks = data.get("weeks", [])
        total_tasks = data.get("total_tasks", 0)

        # 1. Merge completed_tasks
        merged_tasks = {**progress.get("completed_tasks", {}), **update.completed_tasks}

        # 2. Merge test_scores (replace scores for the same week)
        merged_scores = _merge_test_scores(
            progress.get("test_scores", []),
            update.test_scores,
        )

        # 3. Compute completion percentage
        completion_pct = (
            update.completion_percentage
            if update.completion_percentage is not None
            else _compute_completion(merged_tasks, weeks, total_tasks)
        )

        # 4. Persist
        ref.update({
            "progress.completed_tasks": merged_tasks,
            "progress.test_scores": merged_scores,
            "progress.completion_percentage": completion_pct,
            "updated_at": datetime.now(timezone.utc).isoformat(),  # Fix: utcnow() is deprecated
        })

        return {"message": "Progress updated", "completion_percentage": completion_pct}

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/study-plans/{plan_id}/analytics")
async def get_plan_analytics(plan_id: str):
    """Return aggregated analytics for a plan."""
    try:
        db = firebase.get_db()
        doc = _get_doc_or_404(db, plan_id)
        data = doc.to_dict()

        progress = data.get("progress", {})
        weeks_data = data.get("weeks", [])
        test_scores = progress.get("test_scores", [])
        completed_tasks = progress.get("completed_tasks", {})

        completion_by_week = []
        for week_idx, week in enumerate(weeks_data):
            week_tasks = week_completed = 0
            for day, tasks in week.get("daily_tasks", {}).items():
                for task_idx in range(len(tasks)):
                    week_tasks += 1
                    key = f"w{week_idx}_{day}_{task_idx}"
                    if completed_tasks.get(key, False):
                        week_completed += 1
            pct = (week_completed / week_tasks * 100) if week_tasks else 0
            completion_by_week.append({
                "week": week_idx + 1,
                "percent": round(pct, 1),
                "completed": week_completed,
                "total": week_tasks,
            })

        avg_test_score = (
            round(sum(s.get("score", 0) for s in test_scores) / len(test_scores), 1)
            if test_scores else 0
        )

        return {
            "plan_id": plan_id,
            "topic": data.get("topic", ""),
            "duration_weeks": data.get("duration_weeks", 0),
            "avg_test_score": avg_test_score,
            "total_tests": len(test_scores),
            "overall_completion": round(progress.get("completion_percentage", 0), 1),
            "test_scores": test_scores,
            "completion_by_week": completion_by_week,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
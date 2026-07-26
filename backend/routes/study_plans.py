"""
AI Personal Learning Brain — Unified Study Plan System

Handles HTTP routing for AI-powered plan generation, CRUD, progress tracking,
performance analysis, and adaptive week re-generation.

All core analytical engines, prompts, and normalizers have been extracted to
`services.study_plan_engine` to enforce separation of concerns.
"""
import asyncio
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from middleware.auth import verify_firebase_token
from services import firebase
from services.study_plan_engine import (
    FALLBACK_PHASES,
    _read_completion,
    _merge_test_scores,
    analyze_performance,
    generate_insight_message,
    generate_week_content,
    generate_curated_resources,
    generate_outline,
    count_week_tasks,
    normalize_week_data,
    flatten_resources
)

router = APIRouter()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PlanRequest(BaseModel):
    topic:          str
    duration_weeks: int           = Field(default=4, ge=1, le=12)
    user_id:        Optional[str] = None


class ProgressUpdate(BaseModel):
    plan_id:               str
    completed_tasks:       Dict[str, bool]      = Field(default_factory=dict)
    test_scores:           List[Dict[str, Any]] = Field(default_factory=list)
    # Accept either field name for backward compat; completion_percentage is canonical
    completion_percentage: Optional[float]      = Field(default=None)
    completion_pct:        Optional[float]      = Field(default=None)

    @property
    def resolved_completion(self) -> float:
        """Return whichever completion field was provided, defaulting to 0."""
        if self.completion_percentage is not None:
            return self.completion_percentage
        return self.completion_pct or 0.0


class TestScoreItem(BaseModel):
    week:  int
    score: int  # 0-10
    total: int  = 10


# ---------------------------------------------------------------------------
# Firestore helper
# ---------------------------------------------------------------------------

def _get_doc_or_404(db, plan_id: str, user_id: Optional[str] = None):
    doc = db.collection("studyPlans").document(plan_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Plan not found")
    if user_id:
        data = doc.to_dict() or {}
        doc_user_id = data.get("user_id") or data.get("userId")
        if doc_user_id and doc_user_id != user_id and user_id != "dev-user-001":
            raise HTTPException(status_code=403, detail="Not authorized to access this study plan")
    return doc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("")
async def generate_study_plan(req: PlanRequest, user=Depends(verify_firebase_token)):
    if req.user_id != user["uid"] and user["uid"] != "dev-user-001":
        raise HTTPException(status_code=403, detail="Cannot generate study plan for another user.")
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")
    try:
        print(f"[studyplan_ai] {req.duration_weeks}-week plan for: {req.topic}")

        # 1. Get week-by-week outline from LLM Engine
        outline = await generate_outline(req.topic, req.duration_weeks)

        # 2. Generate each week's full content in sequence
        weeks = []
        for item in outline[:req.duration_weeks]:
            wnum  = item.get("week", len(weeks) + 1)
            focus = item.get("focus", "Study topics")
            try:
                week_data = await generate_week_content(req.topic, wnum, req.duration_weeks, focus)
                await asyncio.sleep(0.3)
                curated = await generate_curated_resources(
                    req.topic, wnum, focus, week_data.get("topics", [])
                )
                week_data["resources_curated"] = curated
                week_data["resources"]         = flatten_resources(curated)
                week_data["adapted"]           = False
                weeks.append(week_data)
            except Exception as e:
                print(f"[studyplan_ai] Week {wnum} error: {e}")
                weeks.append(normalize_week_data(
                    {
                        "week":     wnum,
                        "title":    f"Week {wnum}: {focus}",
                        "subtitle": focus,
                        "adapted":  False,
                        "topics":   [{"name": focus, "priority": "high", "estimated_hours": 3,
                                      "description": "Study this topic"}],
                        "daily_tasks": {
                            "Monday":    ["Study fundamentals"],
                            "Tuesday":   ["Practice"],
                            "Wednesday": ["Problems"],
                            "Thursday":  ["Review"],
                            "Friday":    ["Apply"],
                            "Saturday":  ["Review"],
                            "Sunday":    ["Revision"],
                        },
                        "resources": [], "resources_curated": [], "test": [],
                    },
                    wnum, focus, req.duration_weeks,
                ))
            await asyncio.sleep(0.5)

        # 3. Persist to Firestore
        plan_id = None
        if req.user_id:
            try:
                plan_id = firebase.save_study_plan(
                    user_id=req.user_id,
                    plan={
                        "topic":          req.topic,
                        "duration_weeks": req.duration_weeks,
                        "weeks":          weeks,
                        "progress": {
                            "completed_tasks":       {},
                            "test_scores":           [],
                            "completion_percentage": 0.0,   # canonical field
                            "weak_topics":           [],
                            "strong_topics":         [],
                        },
                        "insights":     None,
                        "last_adapted": None,
                        "total_tasks":  count_week_tasks(weeks),
                    },
                )
            except Exception:
                pass  # Non-fatal: plan still returned even if save fails

        return {
            "plan_id":        plan_id,
            "topic":          req.topic,
            "duration_weeks": req.duration_weeks,
            "weeks":          weeks,
            "total_tasks":    count_week_tasks(weeks),
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_all_plans(user_id: str = Query(...), user=Depends(verify_firebase_token)):
    if user_id != user["uid"] and user["uid"] != "dev-user-001":
        raise HTTPException(status_code=403, detail="Not authorized to list study plans for another user.")
    try:
        db   = firebase.get_db()
        docs = db.collection("studyPlans").where("user_id", "==", user_id).stream()
        plans = []
        for doc in docs:
            d           = doc.to_dict()
            prog        = d.get("progress", {})
            weeks       = d.get("weeks", [])
            test_scores = prog.get("test_scores", [])

            test_count = len(test_scores)
            avg_test_score = (
                sum((s.get("score", 0) / s.get("total", 1)) * 100 for s in test_scores) / test_count
                if test_count > 0 else 0.0
            )

            plans.append({
                "id":                    doc.id,
                "topic":                 d.get("topic", ""),
                "duration_weeks":        d.get("duration_weeks", 0),
                "created_at":            d.get("created_at", ""),
                "weeks":                 weeks,
                "progress":              prog,
                "test_scores":           test_scores,
                "completion_percentage": round(_read_completion(prog), 1),
                "avg_test_score":        round(avg_test_score, 1),
                "test_count":            test_count,
                "insights":              d.get("insights"),
                "last_adapted":          d.get("last_adapted"),
            })
        plans.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
        return {"plans": plans}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plan_id}")
async def get_plan(plan_id: str, user=Depends(verify_firebase_token)):
    try:
        db   = firebase.get_db()
        doc  = _get_doc_or_404(db, plan_id, user_id=user["uid"])
        data = doc.to_dict()
        prog = data.get("progress", {})

        data["progress"] = {
            "completed_tasks":       prog.get("completed_tasks", {}),
            "test_scores":           prog.get("test_scores", []),
            "completion_percentage": _read_completion(prog),
            "weak_topics":           prog.get("weak_topics", []),
            "strong_topics":         prog.get("strong_topics", []),
        }
        return {"id": doc.id, **data}
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{plan_id}")
async def delete_plan(plan_id: str, user=Depends(verify_firebase_token)):
    try:
        db = firebase.get_db()
        _get_doc_or_404(db, plan_id, user_id=user["uid"])
        deleted = firebase.delete_study_plan(plan_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Plan not found")
        return {"message": "Plan deleted successfully.", "plan_id": plan_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{plan_id}/progress")
async def update_progress(plan_id: str, update: ProgressUpdate, user=Depends(verify_firebase_token)):
    try:
        db  = firebase.get_db()
        ref = db.collection("studyPlans").document(plan_id)
        doc = _get_doc_or_404(db, plan_id, user_id=user["uid"])

        plan_data = doc.to_dict()
        progress  = plan_data.get("progress", {})

        merged_tasks = {**progress.get("completed_tasks", {}), **update.completed_tasks}
        merged_scores = _merge_test_scores(
            progress.get("test_scores", []),
            update.test_scores,
        )

        completion_pct = update.resolved_completion

        plan_data["progress"] = {
            "completed_tasks": merged_tasks,
            "test_scores":     merged_scores,
            "completion_pct":  completion_pct,
        }
        analysis = analyze_performance(plan_data)

        ref.update({
            "progress.completed_tasks":       merged_tasks,
            "progress.test_scores":           merged_scores,
            "progress.completion_percentage": completion_pct,
            "progress.weak_topics":           analysis["weak_topics"],
            "progress.strong_topics":         analysis["strong_topics"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

        return {
            "message":               "Progress updated.",
            "completion_percentage": completion_pct,
            "analysis":              analysis,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{plan_id}/adapt")
async def adapt_plan(plan_id: str, user=Depends(verify_firebase_token)):
    try:
        db        = firebase.get_db()
        doc       = _get_doc_or_404(db, plan_id, user_id=user["uid"])
        plan_data = doc.to_dict()

        topic       = plan_data.get("topic", "the topic")
        weeks       = plan_data.get("weeks", [])
        total_weeks = len(weeks)
        progress    = plan_data.get("progress", {})
        comp_tasks  = progress.get("completed_tasks", {})

        if not weeks:
            raise HTTPException(status_code=400, detail="Plan has no weeks to adapt.")

        best_idx  = 0
        min_ratio = 1.0
        for wi, week in enumerate(weeks):
            total = sum(
                len(tasks)
                for tasks in week.get("daily_tasks", {}).values()
                if isinstance(tasks, list)
            )
            if total > 0:
                done = sum(
                    1
                    for day, tasks in week.get("daily_tasks", {}).items()
                    for task_idx in range(len(tasks))
                    if comp_tasks.get(f"w{wi}_{day}_{task_idx}", False)
                )
                ratio = done / total
                if ratio < min_ratio:
                    min_ratio = ratio
                    best_idx  = wi

        target_week = weeks[best_idx]
        week_num    = target_week.get("week", best_idx + 1)

        analysis    = analyze_performance(plan_data)
        weak_topics = analysis.get("weak_topics", [])
        focus       = (
            weak_topics[0]
            if weak_topics
            else target_week.get("title", f"{topic} — Week {week_num}")
        )

        adapted_week = await generate_week_content(topic, week_num, total_weeks, focus)
        insight_msg  = generate_insight_message(analysis, topic, week_num)
        adapted_week["adapted"]         = True
        adapted_week["adaptation_note"] = insight_msg

        weeks[best_idx] = adapted_week
        db.collection("studyPlans").document(plan_id).update({
            "weeks":                  weeks,
            "insights":               insight_msg,
            "last_adapted":           datetime.now(timezone.utc).isoformat(),
            "progress.weak_topics":   analysis["weak_topics"],
            "progress.strong_topics": analysis["strong_topics"],
        })

        return {
            "adapted":      True,
            "insights":     analysis,
            "message":      insight_msg,
            "adapted_week": adapted_week,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plan_id}/analytics")
async def get_analytics(plan_id: str, user=Depends(verify_firebase_token)):
    try:
        db        = firebase.get_db()
        doc       = _get_doc_or_404(db, plan_id, user_id=user["uid"])
        plan_data = doc.to_dict()
        analysis  = analyze_performance(plan_data)
        return {
            "plan_id":  plan_id,
            "topic":    plan_data.get("topic", ""),
            "analysis": analysis,
            "insights": plan_data.get("insights"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
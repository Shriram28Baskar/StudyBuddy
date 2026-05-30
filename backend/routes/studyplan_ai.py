"""
AI Personal Learning Brain — Adaptive Study System
Extends the study plan system with performance tracking,
weak topic detection, and auto-adaptive plan regeneration.
"""
import asyncio
import json
import re
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services import firebase
from services.llm import complete

router = APIRouter()

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_RESOURCE_TYPES = {"video", "documentation", "book", "practice", "course", "article"}
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}

FALLBACK_PHASES = [
    "Foundations", "Core Concepts", "Advanced Topics", "Projects & Revision",
    "Deep Dive", "Specialization", "Integration", "Optimization",
    "Expert Topics", "Capstone", "Final Review", "Mastery",
]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class PlanRequest(BaseModel):
    topic:          str
    duration_weeks: int           = Field(default=4, ge=1, le=12)
    user_id:        Optional[str] = None


class ProgressUpdate(BaseModel):
    plan_id:         str
    completed_tasks: Dict[str, bool]    = Field(default_factory=dict)
    test_scores:     List[Dict[str, Any]] = Field(default_factory=list)
    completion_pct:  float              = 0.0


class TestScoreItem(BaseModel):
    week:  int
    score: int  # 0-10
    total: int  = 10


# ---------------------------------------------------------------------------
# Text / JSON helpers
# ---------------------------------------------------------------------------

def clean_text(value, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback


def extract_json_object(raw: str, label: str) -> dict:
    raw = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        raise ValueError(f"No JSON object found for {label}")
    text = match.group()
    text += "]" * max(0, text.count("[") - text.count("]"))
    text += "}" * max(0, text.count("{") - text.count("}"))
    return json.loads(text)


# ---------------------------------------------------------------------------
# Normalizers
# ---------------------------------------------------------------------------

def normalize_topics(topics, fallback_focus: str) -> list:
    if not isinstance(topics, list):
        topics = []
    normalized = []
    for idx, topic in enumerate(topics[:5]):
        if isinstance(topic, dict):
            name = clean_text(topic.get("name"), f"{fallback_focus} topic {idx + 1}")
            priority = clean_text(topic.get("priority"), "medium").lower()
            if priority not in VALID_PRIORITIES:
                priority = "medium"
            try:
                estimated_hours = float(topic.get("estimated_hours", 2))
            except (TypeError, ValueError):
                estimated_hours = 2.0
            normalized.append({
                "name": name,
                "priority": priority,
                "estimated_hours": max(0.5, round(estimated_hours, 1)),
                "description": clean_text(topic.get("description"), f"Study and practice {name}."),
                "exam_frequent": bool(topic.get("exam_frequent", False)),
            })
        else:
            name = clean_text(topic, f"{fallback_focus} topic {idx + 1}")
            normalized.append({
                "name": name,
                "priority": "medium",
                "estimated_hours": 2.0,
                "description": f"Study and practice {name}.",
            })
    if not normalized:
        normalized.append({
            "name": fallback_focus,
            "priority": "high",
            "estimated_hours": 3.0,
            "description": f"Build understanding and practice in {fallback_focus}.",
        })
    return normalized


def normalize_daily_tasks(daily_tasks, topics: list) -> dict:
    if not isinstance(daily_tasks, dict):
        daily_tasks = {}
    topic_names = [t["name"] for t in topics] or ["the core topic"]
    normalized = {}
    for idx, day in enumerate(DAYS):
        raw_tasks = daily_tasks.get(day) or daily_tasks.get(day.lower()) or []
        if isinstance(raw_tasks, str):
            raw_tasks = [raw_tasks]
        if not isinstance(raw_tasks, list):
            raw_tasks = []
        tasks = []
        for task in raw_tasks[:3]:
            if isinstance(task, dict):
                task = task.get("task") or task.get("title") or task.get("description")
            tasks.append(clean_text(task, "Study and practice").rstrip("."))
        if not tasks:
            focus = topic_names[idx % len(topic_names)]
            tasks = (
                [f"Review {focus}", "Revise notes and mistakes"]
                if day in {"Saturday", "Sunday"}
                else [f"Study {focus}", f"Practice questions on {focus}"]
            )
        normalized[day] = tasks[:3]
    return normalized


def normalize_test(test, topics: list) -> list:
    if not isinstance(test, list):
        test = []
    topic_names = [t["name"] for t in topics] or ["this week's topic"]
    normalized = []
    for idx, question in enumerate(test[:5]):
        if not isinstance(question, dict):
            continue
        options = question.get("options")
        if not isinstance(options, list):
            options = []
        options = [clean_text(opt, f"Option {i + 1}") for i, opt in enumerate(options[:4])]
        while len(options) < 4:
            options.append(f"Option {len(options) + 1}")
        correct = clean_text(question.get("correct_answer"), options[0])
        if correct not in options:
            correct = options[0]
        normalized.append({
            "id": idx + 1,
            "question": clean_text(
                question.get("question"),
                f"Question about {topic_names[idx % len(topic_names)]}?",
            ),
            "options": options,
            "correct_answer": correct,
            "explanation": clean_text(
                question.get("explanation"),
                "Review the related topic to understand the answer.",
            ),
        })
    # Pad to 5 questions
    while len(normalized) < 5:
        idx = len(normalized)
        topic = topic_names[idx % len(topic_names)]
        normalized.append({
            "id": idx + 1,
            "question": f"What is a key idea from {topic}?",
            "options": ["Core concept", "Unrelated fact", "Random formula", "None of these"],
            "correct_answer": "Core concept",
            "explanation": f"This checks recall of the main idea from {topic}.",
        })
    return normalized


def normalize_curated_resources(curated) -> list:
    if not isinstance(curated, list):
        return []
    groups = []
    for group in curated:
        if not isinstance(group, dict):
            continue
        items = group.get("items", [])
        if not isinstance(items, list):
            items = []
        normalized_items = []
        for item in items[:5]:
            if not isinstance(item, dict):
                continue
            resource_type = clean_text(item.get("type"), "article").lower()
            difficulty    = clean_text(item.get("difficulty"), "beginner").lower()
            normalized_items.append({
                "title":      clean_text(item.get("title"), "Learning resource"),
                "type":       resource_type if resource_type in VALID_RESOURCE_TYPES else "article",
                "url":        clean_text(item.get("url") or item.get("link"), "#"),
                "description": clean_text(item.get("description"), "Useful for this topic."),
                "difficulty": difficulty if difficulty in VALID_DIFFICULTIES else "beginner",
            })
        groups.append({"topic": clean_text(group.get("topic"), "General"), "items": normalized_items})
    return groups


def normalize_week_data(
    week_data,
    week_num: int,
    focus: str,
    total_weeks: int,
    adapted: bool = False,
) -> dict:
    if not isinstance(week_data, dict):
        week_data = {}
    topics = normalize_topics(week_data.get("topics"), focus)
    try:
        resolved_week = int(week_data.get("week") or week_num)
    except (TypeError, ValueError):
        resolved_week = week_num

    normalized = {
        "week":        resolved_week,
        "title":       clean_text(week_data.get("title"), f"Week {week_num}: {focus}"),
        "subtitle":    clean_text(week_data.get("subtitle"), f"Week {week_num} of {total_weeks}"),
        "topics":      topics,
        "daily_tasks": normalize_daily_tasks(week_data.get("daily_tasks"), topics),
        "test":        normalize_test(week_data.get("test"), topics),
        "adapted":     bool(week_data.get("adapted", adapted)),
    }
    if "revision" in week_data:
        normalized["revision"] = week_data["revision"]
    if "resources_curated" in week_data:
        normalized["resources_curated"] = normalize_curated_resources(week_data["resources_curated"])
    if isinstance(week_data.get("resources"), list):
        normalized["resources"] = week_data["resources"]
    if week_data.get("adaptation_note"):
        normalized["adaptation_note"] = clean_text(week_data["adaptation_note"])
    return normalized


def flatten_resources(curated: list) -> list:
    return [
        {
            "title":       item.get("title", ""),
            "type":        item.get("type", "article"),
            "url":         item.get("url", "#"),
            "link":        item.get("url", "#"),
            "description": item.get("description", ""),
            "difficulty":  item.get("difficulty", "beginner"),
            "topic":       group.get("topic", ""),
        }
        for group in curated
        for item in group.get("items", [])
    ]


def count_week_tasks(weeks: list) -> int:
    return sum(
        len(tasks)
        for week in weeks
        for tasks in week.get("daily_tasks", {}).values()
        if isinstance(tasks, list)
    )


# ---------------------------------------------------------------------------
# Firestore helper
# ---------------------------------------------------------------------------

def _get_doc_or_404(db, plan_id: str):
    doc = db.collection("studyPlans").document(plan_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Plan not found")
    return doc


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

OUTLINE_PROMPT = """Create a {weeks}-week study outline for "{topic}".
Each week must have a distinct focus area with specific subtopics.
Return ONLY JSON: {{"weeks": [{{"week": 1, "focus": "Foundations: Arrays, Linked Lists, Stacks and Queues"}}, ...]}}
- The focus must be a short phrase describing the key subtopics covered that week, like "Foundations: Arrays, Linked Lists, Stacks and Queues"
- Distribute the subject evenly across all {weeks} weeks — no two weeks should repeat the same subtopics
- Generate exactly {weeks} entries."""

WEEK_PROMPT = """Generate week {week_num} of {total_weeks} for "{topic}" — Focus: {week_focus}.

Rules:
- The week must ONLY cover the topics listed in the Focus above, not the whole subject
- Title should be short (e.g. "Week {week_num}: {week_focus}")
- Subtitle must list the key subtopics as a short comma-separated phrase (e.g. "Arrays, Linked Lists, Stacks, Queues")
- Each topic must include a "exam_frequent" boolean field (true if commonly tested)
- Daily tasks must be specific and actionable (not generic like "Study topic")
- All 7 days must have at least 2 tasks each

Return ONLY valid JSON:
{{
  "week": {week_num},
  "title": "Week {week_num}: Short Title",
  "subtitle": "Topic 1, Topic 2, Topic 3",
  "topics": [
    {{"name": "Topic Name", "priority": "high", "estimated_hours": 3, "description": "What will be learned", "exam_frequent": true}}
  ],
  "daily_tasks": {{
    "Monday": ["Specific task 1", "Specific task 2"],
    "Tuesday": ["Specific task 1", "Specific task 2"],
    "Wednesday": ["Specific task 1", "Specific task 2"],
    "Thursday": ["Specific task 1", "Specific task 2"],
    "Friday": ["Specific task 1", "Specific task 2"],
    "Saturday": ["Review task 1", "Mock practice task"],
    "Sunday": ["Revision task", "Take the Weekly Test"]
  }},
  "test": [{{"id": 1, "question": "Q?", "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "Why"}}],
  "revision": {{
    "topics_to_revise": ["Topic 1", "Topic 2"],
    "key_points": ["Key insight 1", "Key insight 2", "Key insight 3"],
    "quick_tips": ["Actionable tip 1", "Actionable tip 2"]
  }}
}}
Include 3-5 topics, exactly 5 MCQs, and a revision guide. Return ONLY JSON."""

RESOURCES_PROMPT = """Curate TOP learning resources for "{topic}" (Week {week_num}: {week_focus}).
Topics: {topics_list}
Return ONLY JSON:
{{"resources": [{{"topic": "Name", "items": [{{"title": "...", "type": "video|documentation|book|practice|course", "url": "https://...", "description": "Why best", "difficulty": "beginner|intermediate|advanced"}}]}}]}}
3-5 items per topic. Real URLs only."""

ADAPTIVE_PROMPT = """You are an expert adaptive tutor.

Student is studying: {topic}
Current Week: {current_week} of {total_weeks}

Performance Analysis:
- Weak topics (score < 5/10): {weak_topics}
- Strong topics (score > 8/10): {strong_topics}
- Average test score: {avg_score}/10
- Task completion: {completion_pct}%

Progress summary: {progress_summary}

Task: Regenerate ONLY Week {next_week} with adaptive focus.

Rules:
- Add MORE practice sessions for weak topics
- REDUCE repetition for strong topics
- If score < 4, simplify explanations and add foundational tasks
- Keep workload realistic (1-3 tasks per day)
- Include extra revision for weak areas on Saturday/Sunday
- Maintain exact same JSON structure

Return ONLY valid JSON:
{{
  "week": {next_week},
  "title": "Adaptive: [focus area]",
  "subtitle": "Personalized based on your performance",
  "adapted": true,
  "adaptation_note": "Brief note on what was changed and why",
  "topics": [{{"name": "Topic", "priority": "high", "estimated_hours": 3, "description": "Desc"}}],
  "daily_tasks": {{
    "Monday": ["Task 1", "Task 2"],
    "Tuesday": ["Task 1"],
    "Wednesday": ["Task 1"],
    "Thursday": ["Task 1"],
    "Friday": ["Task 1"],
    "Saturday": ["Revision: weak topic", "Practice problems"],
    "Sunday": ["Review all weak areas", "Prepare for next week"]
  }},
  "test": [{{"id": 1, "question": "Q?", "options": ["A","B","C","D"], "correct_answer": "A", "explanation": "Why"}}]
}}"""


# ---------------------------------------------------------------------------
# Performance analysis
# ---------------------------------------------------------------------------

def analyze_performance(plan_data: dict) -> dict:
    """
    Analyze user performance and classify topics.
    score < 5  → weak | score >= 8 → strong
    """
    progress    = plan_data.get("progress", {})
    test_scores = progress.get("test_scores", [])
    comp_tasks  = progress.get("completed_tasks", {})
    weeks       = plan_data.get("weeks", [])

    week_topics: Dict[int, List[str]] = {
        w.get("week", 0): [t.get("name", "") for t in w.get("topics", [])]
        for w in weeks
    }

    weak_topics:   List[str] = []
    strong_topics: List[str] = []
    avg_score = (
        sum(s.get("score", 0) for s in test_scores) / len(test_scores)
        if test_scores else 0
    )

    for entry in test_scores:
        wn    = entry.get("week", 0)
        score = entry.get("score", 0)
        total = entry.get("total", 10)
        pct   = (score / total) * 10 if total > 0 else 0
        for t in week_topics.get(wn, []):
            if pct < 5 and t not in weak_topics:
                weak_topics.append(t)
            elif pct >= 8 and t not in strong_topics:
                strong_topics.append(t)

    done_tasks  = sum(1 for v in comp_tasks.values() if v)
    total_tasks = len(comp_tasks)
    completion_pct = (done_tasks / total_tasks * 100) if total_tasks > 0 else 0.0

    return {
        "weak_topics":      weak_topics,
        "strong_topics":    strong_topics,
        "avg_score":        round(avg_score, 1),
        "completion_pct":   round(completion_pct, 1),
        "tests_taken":      len(test_scores),
        "suggest_revision": total_tasks > 0 and completion_pct < 20,
    }


def generate_insight_message(analysis: dict, topic: str, week_num: int) -> str:
    if not analysis["tests_taken"]:
        return f"Complete your first weekly test to unlock personalized recommendations for {topic}."

    avg  = analysis["avg_score"]
    comp = analysis["completion_pct"]
    weak = analysis["weak_topics"]
    strong = analysis["strong_topics"]

    if avg < 4:
        summary = f"Your average score is {avg}/10 — let's slow down and reinforce the fundamentals."
    elif avg < 7:
        summary = f"You're averaging {avg}/10 — good progress! Let's strengthen a few areas."
    else:
        summary = f"Excellent! You're averaging {avg}/10 — you're on track!"

    parts = [summary]
    if weak:
        parts.append(f"We've added extra practice for: {', '.join(weak[:3])}.")
    if strong:
        parts.append(f"You've mastered: {', '.join(strong[:3])} — moving ahead faster there.")
    if comp < 50:
        parts.append(f"Only {comp}% tasks done — try completing at least 2 tasks per day.")
    if analysis["suggest_revision"]:
        parts.append("Week updated to include a revision focus — you've been inactive recently.")
    parts.append(f"Week {week_num} has been personalized based on your performance.")
    return " ".join(parts)


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

async def generate_week_content(topic: str, week_num: int, total: int, focus: str) -> dict:
    raw = await complete(
        system_prompt=WEEK_PROMPT.format(
            week_num=week_num, total_weeks=total, topic=topic, week_focus=focus
        ),
        user_message=f"Generate week {week_num} for {topic}",
        max_tokens=1500,
        temperature=0.4,
    )
    return normalize_week_data(extract_json_object(raw, f"week {week_num}"), week_num, focus, total)


async def generate_curated_resources(
    topic: str,
    week_num: int,
    focus: str,
    week_topics: list,
) -> list:
    topics_list = ", ".join(t.get("name", "") for t in week_topics[:5])
    raw = await complete(
        system_prompt=RESOURCES_PROMPT.format(
            topic=topic, week_num=week_num, week_focus=focus, topics_list=topics_list
        ),
        user_message=f"Curate resources for week {week_num}: {topics_list}",
        max_tokens=2000,
        temperature=0.2,
    )
    try:
        return normalize_curated_resources(
            extract_json_object(raw, f"resources week {week_num}").get("resources", [])
        )
    except Exception:
        return []


async def regenerate_week_adaptive(
    topic: str,
    plan_data: dict,
    analysis: dict,
    next_week: int,
    total_weeks: int,
) -> dict:
    progress_summary = (
        f"{analysis['tests_taken']} tests taken, "
        f"avg score {analysis['avg_score']}/10, "
        f"{analysis['completion_pct']}% tasks completed"
    )
    prompt = ADAPTIVE_PROMPT.format(
        topic=topic,
        current_week=next_week - 1,
        total_weeks=total_weeks,
        weak_topics=", ".join(analysis["weak_topics"]) or "None identified",
        strong_topics=", ".join(analysis["strong_topics"]) or "None yet",
        avg_score=analysis["avg_score"],
        completion_pct=analysis["completion_pct"],
        progress_summary=progress_summary,
        next_week=next_week,
    )
    raw = await complete(
        system_prompt=prompt,
        user_message=f"Generate adaptive week {next_week} for {topic}",
        max_tokens=2000,
        temperature=0.3,
    )
    return normalize_week_data(
        extract_json_object(raw, "adaptive week"),
        next_week,
        "Adaptive review",
        total_weeks,
        adapted=True,
    )


# ---------------------------------------------------------------------------
# Routes — plan generation
# ---------------------------------------------------------------------------

@router.post("")
async def generate_study_plan(req: PlanRequest):
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")
    try:
        print(f"[studyplan_ai] {req.duration_weeks}-week plan for: {req.topic}")

        # 1. Get outline
        outline_raw = await complete(
            system_prompt=OUTLINE_PROMPT.format(weeks=req.duration_weeks, topic=req.topic),
            user_message=f"Create outline for {req.topic}",
            max_tokens=400,
            temperature=0.3,
        )
        outline_raw = re.sub(r"```(?:json)?\s*", "", outline_raw.strip()).replace("```", "").strip()
        match = re.search(r"\{[\s\S]*\}", outline_raw)
        if match:
            oj = match.group()
            oj += "]" * max(0, oj.count("[") - oj.count("]"))
            oj += "}" * max(0, oj.count("{") - oj.count("}"))
            try:
                outline = json.loads(oj).get("weeks", [])
            except Exception:
                outline = []
        else:
            outline = []

        if not isinstance(outline, list):
            outline = []

        # Ensure the outline has exactly `req.duration_weeks` entries
        while len(outline) < req.duration_weeks:
            outline.append({
                "week": len(outline) + 1, 
                "focus": FALLBACK_PHASES[len(outline) % len(FALLBACK_PHASES)]
            })

        # 2. Generate each week
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
                        "week": wnum, "title": f"Week {wnum}: {focus}", "subtitle": focus,
                        "adapted": False,
                        "topics": [{"name": focus, "priority": "high", "estimated_hours": 3,
                                    "description": "Study this topic"}],
                        "daily_tasks": {
                            "Monday": ["Study fundamentals"], "Tuesday": ["Practice"],
                            "Wednesday": ["Problems"],        "Thursday": ["Review"],
                            "Friday": ["Apply"],              "Saturday": ["Review"],
                            "Sunday": ["Revision"],
                        },
                        "resources": [], "resources_curated": [], "test": [],
                    },
                    wnum, focus, req.duration_weeks,
                ))
            await asyncio.sleep(0.5)

        # 3. Persist
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
                            "completed_tasks": {},
                            "test_scores":     [],
                            "completion_pct":  0.0,
                            "weak_topics":     [],
                            "strong_topics":   [],
                        },
                        "insights":     None,
                        "last_adapted": None,
                        "total_tasks":  count_week_tasks(weeks),
                    },
                )
            except Exception:
                pass  # Non-fatal: plan still returned even if save fails

        total = count_week_tasks(weeks)
        return {
            "plan_id":        plan_id,
            "topic":          req.topic,
            "duration_weeks": req.duration_weeks,
            "weeks":          weeks,
            "total_tasks":    total,
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — legacy progress (must be BEFORE /{plan_id} to avoid path conflict)
# ---------------------------------------------------------------------------

@router.post("/progress")
async def save_progress_legacy(data: dict):
    try:
        plan_id = data.get("plan_id")
        if not plan_id:
            raise HTTPException(status_code=400, detail="plan_id required")
        db  = firebase.get_db()
        ref = db.collection("studyPlans").document(plan_id)
        ref.update({"progress": data.get("progress", {})})
        return {"message": "Progress saved."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — history
# ---------------------------------------------------------------------------

@router.get("")
async def get_all_plans(user_id: str = Query(...)):
    try:
        db   = firebase.get_db()
        docs = db.collection("studyPlans").where("user_id", "==", user_id).stream()
        plans = []
        for doc in docs:
            d    = doc.to_dict()
            prog = d.get("progress", {})
            plans.append({
                "id":             doc.id,
                "topic":          d.get("topic", ""),
                "duration_weeks": d.get("duration_weeks", 0),
                "created_at":     d.get("created_at", ""),
                "completion_pct": prog.get("completion_pct", 0),
                "test_scores":    prog.get("test_scores", []),
                "weak_topics":    prog.get("weak_topics", []),
                "strong_topics":  prog.get("strong_topics", []),
                "insights":       d.get("insights"),
                "last_adapted":   d.get("last_adapted"),
            })
        plans.sort(key=lambda x: str(x.get("created_at", "")), reverse=True)
        return {"plans": plans}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{plan_id}")
async def get_plan(plan_id: str):
    try:
        db  = firebase.get_db()
        doc = _get_doc_or_404(db, plan_id)
        return {"id": doc.id, **doc.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — progress
# ---------------------------------------------------------------------------

@router.patch("/{plan_id}/progress")
async def update_progress(plan_id: str, update: ProgressUpdate):
    """Update progress and run performance analysis."""
    try:
        db  = firebase.get_db()
        ref = db.collection("studyPlans").document(plan_id)
        doc = _get_doc_or_404(db, plan_id)

        plan_data = doc.to_dict()
        plan_data["progress"] = {
            "completed_tasks": update.completed_tasks,
            "test_scores":     update.test_scores,
            "completion_pct":  update.completion_pct,
        }
        analysis = analyze_performance(plan_data)

        ref.update({
            "progress.completed_tasks": update.completed_tasks,
            "progress.test_scores":     update.test_scores,
            "progress.completion_pct":  update.completion_pct,
            "progress.weak_topics":     analysis["weak_topics"],
            "progress.strong_topics":   analysis["strong_topics"],
        })
        return {"message": "Progress updated.", "analysis": analysis}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — adapt
# ---------------------------------------------------------------------------

@router.post("/{plan_id}/adapt")
async def adapt_plan(plan_id: str):
    """
    Adaptive engine:
    1. Fetch plan + progress
    2. Analyse performance
    3. Regenerate the next incomplete week
    4. Persist adapted week + insights
    """
    try:
        db  = firebase.get_db()
        ref = db.collection("studyPlans").document(plan_id)
        doc = _get_doc_or_404(db, plan_id)

        plan_data = doc.to_dict()
        topic     = plan_data.get("topic", "")
        weeks     = plan_data.get("weeks", [])
        total_wks = plan_data.get("duration_weeks", len(weeks))
        scores    = plan_data.get("progress", {}).get("test_scores", [])

        if not scores:
            return {
                "adapted":  False,
                "message":  "Complete at least one weekly test to unlock adaptive planning.",
                "insights": None,
            }

        tested_weeks = {s.get("week") for s in scores}
        next_week    = max(tested_weeks) + 1 if tested_weeks else 1

        if next_week > total_wks:
            return {
                "adapted":  False,
                "message":  "You've completed all weeks! Great job.",
                "insights": None,
            }

        analysis = analyze_performance(plan_data)
        print(f"[adapt] Weak: {analysis['weak_topics']} | Strong: {analysis['strong_topics']}")

        adapted_week = await regenerate_week_adaptive(topic, plan_data, analysis, next_week, total_wks)

        try:
            curated = await generate_curated_resources(
                topic, next_week, adapted_week.get("title", ""), adapted_week.get("topics", [])
            )
            adapted_week["resources_curated"] = curated
            adapted_week["resources"]         = flatten_resources(curated)
        except Exception:
            adapted_week["resources_curated"] = []
            adapted_week["resources"]         = []

        now = datetime.now(timezone.utc).isoformat()
        insights = {
            "message":       generate_insight_message(analysis, topic, next_week),
            "weak_topics":   analysis["weak_topics"],
            "strong_topics": analysis["strong_topics"],
            "avg_score":     analysis["avg_score"],
            "adapted_week":  next_week,
            "updated_at":    now,
        }

        # Replace or append the adapted week
        updated_weeks = [
            adapted_week if w.get("week") == next_week else w
            for w in weeks
        ]
        if not any(w.get("week") == next_week for w in weeks):
            updated_weeks.append(adapted_week)

        ref.update({
            "weeks":                  updated_weeks,
            "insights":               insights,
            "last_adapted":           now,
            "progress.weak_topics":   analysis["weak_topics"],
            "progress.strong_topics": analysis["strong_topics"],
        })

        return {
            "adapted":      True,
            "message":      insights["message"],
            "adapted_week": adapted_week,
            "insights":     insights,
            "analysis":     analysis,
        }

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Routes — analytics
# ---------------------------------------------------------------------------

@router.get("/{plan_id}/analytics")
async def get_analytics(plan_id: str):
    try:
        db  = firebase.get_db()
        doc = _get_doc_or_404(db, plan_id)
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

"""
Study Plan Engine - Encapsulates all analytical and generative business logic
for the AI Personal Learning Brain.
"""
import re
import json
from typing import Dict, List, Any

from services.llm import complete
from utils.json_helper import extract_json_object
from services.prompts.study_plan_prompts import OUTLINE_PROMPT, WEEK_PROMPT, RESOURCES_PROMPT

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

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
# Helpers
# ---------------------------------------------------------------------------

def _read_completion(progress: dict) -> float:
    """Read completion from a Firestore progress dict (handles legacy fields)."""
    if "completion_percentage" in progress:
        return progress["completion_percentage"]
    return progress.get("completion_pct", 0.0)


def _merge_test_scores(existing: list, incoming: list) -> list:
    """Merge test scores by week — later entries for the same week win."""
    score_map = {s.get("week"): s for s in existing}
    for score in incoming:
        score_map[score.get("week")] = score
    return list(score_map.values())


def clean_text(value, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text or fallback

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
                "name":            name,
                "priority":        priority,
                "estimated_hours": max(0.5, round(estimated_hours, 1)),
                "description":     clean_text(topic.get("description"), f"Study and practice {name}."),
                "exam_frequent":   bool(topic.get("exam_frequent", False)),
            })
        else:
            name = clean_text(topic, f"{fallback_focus} topic {idx + 1}")
            normalized.append({
                "name":            name,
                "priority":        "medium",
                "estimated_hours": 2.0,
                "description":     f"Study and practice {name}.",
            })
    if not normalized:
        normalized.append({
            "name":            fallback_focus,
            "priority":        "high",
            "estimated_hours": 3.0,
            "description":     f"Build understanding and practice in {fallback_focus}.",
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
            "id":             idx + 1,
            "question":       clean_text(
                question.get("question"),
                f"Question about {topic_names[idx % len(topic_names)]}?",
            ),
            "options":        options,
            "correct_answer": correct,
            "explanation":    clean_text(
                question.get("explanation"),
                "Review the related topic to understand the answer.",
            ),
        })
    while len(normalized) < 5:
        idx   = len(normalized)
        topic = topic_names[idx % len(topic_names)]
        normalized.append({
            "id":             idx + 1,
            "question":       f"What is a key idea from {topic}?",
            "options":        ["Core concept", "Unrelated fact", "Random formula", "None of these"],
            "correct_answer": "Core concept",
            "explanation":    f"This checks recall of the main idea from {topic}.",
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
                "title":       clean_text(item.get("title"), "Learning resource"),
                "type":        resource_type if resource_type in VALID_RESOURCE_TYPES else "article",
                "url":         clean_text(item.get("url") or item.get("link"), "#"),
                "description": clean_text(item.get("description"), "Useful for this topic."),
                "difficulty":  difficulty if difficulty in VALID_DIFFICULTIES else "beginner",
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
# Performance Analysis
# ---------------------------------------------------------------------------

def analyze_performance(plan_data: dict) -> dict:
    """
    Analyse user performance and classify topics by score thresholds.
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

    done_tasks     = sum(1 for v in comp_tasks.values() if v)
    total_tasks    = len(comp_tasks)
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

    avg    = analysis["avg_score"]
    comp   = analysis["completion_pct"]
    weak   = analysis["weak_topics"]
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
# LLM Orchestration
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

async def generate_outline(topic: str, duration_weeks: int) -> list:
    outline_raw = await complete(
        system_prompt=OUTLINE_PROMPT.format(weeks=duration_weeks, topic=topic),
        user_message=f"Create outline for {topic}",
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
        
    while len(outline) < duration_weeks:
        outline.append({
            "week":  len(outline) + 1,
            "focus": FALLBACK_PHASES[len(outline) % len(FALLBACK_PHASES)],
        })
        
    return outline

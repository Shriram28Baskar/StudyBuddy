"""
AI Prompts for the Study Plan Engine.
"""

OUTLINE_PROMPT = """Create a {weeks}-week study outline for "{topic}".
Each week must have a distinct focus area with specific subtopics.
Return ONLY JSON: {{"weeks": [{{"week": 1, "focus": "Foundational Concepts"}}, ...]}}
- The focus must be a short phrase describing the key subtopics covered that week, relevant to {topic}.
- Distribute the subject evenly across all {weeks} weeks — no two weeks should repeat the same subtopics
- Generate exactly {weeks} entries."""

WEEK_PROMPT = """Generate week {week_num} of {total_weeks} for "{topic}" — Focus: {week_focus}.

Rules:
- The week must ONLY cover the topics listed in the Focus above, not the whole subject
- Title should be short (e.g. "Week {week_num}: {week_focus}")
- Subtitle must list the key subtopics as a short comma-separated phrase (e.g. "Subtopic 1, Subtopic 2")
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

import asyncio
import os
from typing import Optional, List, Dict
from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, retry_if_exception_type
from dotenv import load_dotenv

load_dotenv()

_client: Optional[Groq] = None

# Detect if we're in development to print debug info
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in environment")
        # Print first few characters for verification (safe)
        if DEBUG:
            print(f"[llm] Using Groq API key starting with: {api_key[:8]}...")
        _client = Groq(api_key=api_key)
    return _client

def should_retry(e: BaseException) -> bool:
    if isinstance(e, RuntimeError) and "GROQ_API_KEY" in str(e):
        return False
    return isinstance(e, Exception)

# Switch to a smaller, cheaper model to stay under daily limits
# The default model now is llama-3.1-8b-instant (~1/10th tokens of 70b model)
MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


def build_tutor_prompt(subject: str, topic: str, level: str) -> str:
    return f"""You are a personalized AI tutor specializing in academic subjects.

User context:
- Subject: {subject}
- Topic: {topic or "general"}
- Level: {level}

When answering:
1. Give a clear, simple explanation appropriate for the level
2. Provide a concrete example
3. List 3-5 key takeaways as bullet points

Be concise, encouraging, and accurate."""


def build_rag_prompt(context_chunks: List[str], question: str) -> str:
    context = "\n\n---\n\n".join(context_chunks)
    return f"""You are a document analysis assistant. Answer the user's question using ONLY the provided document excerpts below.

If the answer is not found in the excerpts, say "I couldn't find that in the document."

Document excerpts:
{context}

Question: {question}

Answer clearly and cite which part of the document supports your answer."""


def build_studyplan_prompt(exam: str, subjects: List[str], hours: float, days: int) -> str:
    subjects_str = ", ".join(subjects)
    return f"""You are an expert academic planner. Create a detailed {days}-day study plan.

Details:
- Exam/Goal: {exam}
- Subjects: {subjects_str}
- Study hours per day: {hours}

Return ONLY valid JSON in this exact format, no explanation:
{{
  "plan": [
    {{
      "day": "Day 1",
      "date": "Mon",
      "tasks": [
        {{"subject": "Math", "topic": "Algebra basics", "hours": 2}},
        {{"subject": "Physics", "topic": "Kinematics", "hours": 2}}
      ]
    }}
  ],
  "summary": "Brief overview of the plan strategy"
}}

Distribute subjects evenly. Total hours per day must equal {hours}. Generate exactly {days} days."""


def build_mindmap_prompt(topic: str) -> str:
    return f"""Generate a comprehensive mind map for the topic: "{topic}"

Return ONLY valid JSON in this exact format, no explanation:
{{
  "topic": "{topic}",
  "nodes": [
    {{
      "name": "Main concept 1",
      "children": ["subtopic a", "subtopic b", "subtopic c"]
    }}
  ]
}}

Include 5-7 main nodes, each with 3-5 children. Make it academically accurate."""


def build_roadmap_prompt(goal: str, serp_data: str) -> str:
    return f"""You are a world-class career and learning advisor. Your job is to create an extremely detailed, actionable learning roadmap.

Goal: {goal}

Relevant market data from web search:
{serp_data}

Return ONLY valid JSON in this exact format, no markdown, no explanation:
{{
  "goal": "{goal}",
  "estimatedTime": "X-Y weeks",
  "phases": [
    {{
      "phase": "Step 1",
      "title": "Descriptive Phase Title",
      "duration": "X weeks",
      "description": "A detailed 2-3 sentence paragraph explaining WHAT the learner will study in this phase, WHY it matters, and HOW it connects to their overall goal. Be specific and motivating.",
      "skills": ["Specific Skill 1", "Specific Skill 2", "Specific Skill 3", "Specific Skill 4", "Specific Skill 5"],
      "resources": [
        {{
          "title": "Full Resource Name (Platform or Author)",
          "url": "https://actual-url.com",
          "type": "course",
          "description": "One sentence on why this resource is recommended"
        }},
        {{
          "title": "Book Title by Author Name",
          "url": "",
          "type": "book",
          "description": "One sentence on why this resource is recommended"
        }},
        {{
          "title": "YouTube Channel or Video Name",
          "url": "https://youtube.com/...",
          "type": "video",
          "description": "One sentence on why this resource is recommended"
        }}
      ]
    }}
  ]
}}

STRICT REQUIREMENTS:
- Generate exactly 6 phases that form a complete, progressive learning journey
- Each phase MUST have a "description" field with 2-3 detailed sentences (minimum 40 words)
- Each phase MUST have exactly 4-6 skills (specific, not generic)
- Each phase MUST have exactly 3 resources with real, well-known names
- Resources must be a mix of types: course, book, video, documentation, website
- "estimatedTime" must be a total like "16-24 weeks" summing all phases
- Phase titles must be specific to the goal "{goal}", not generic
- Skills must be concrete and learnable (e.g. "NumPy array operations" not just "Python")
- Resource titles must be real, well-known resources (Coursera, edX, O'Reilly books, YouTube channels, official docs)
- DO NOT use placeholder text like "resource1" or "skill1"
- The progression must go: Fundamentals → Core Concepts → Intermediate Skills → Advanced Topics → Real Projects → Mastery/Optimization"""


def build_career_prompt(skills: List[str], interests: List[str], serp_data: str) -> str:
    return f"""You are a career counselor with deep knowledge of tech and non-tech industries.

User profile:
- Skills: {", ".join(skills)}
- Interests: {", ".join(interests)}

Market data from web search:
{serp_data}

Return ONLY valid JSON in this exact format, no explanation:
{{
  "roles": [
    {{
      "title": "Role title",
      "salary": "$80,000 - $120,000",
      "match": 85,
      "skills": ["required skill 1", "required skill 2"],
      "nextStep": "Concrete action to pursue this role"
    }}
  ]
}}

Return 4 distinct career roles ranked by match percentage (0-100)."""


@retry(
    stop=stop_after_attempt(5),                           # try 5 times
    wait=wait_exponential(multiplier=2, min=4, max=60),   # wait 4, 8, 16, 32, 60 seconds
    retry=retry_if_exception(should_retry)                # retry exception if not missing API key
)
async def complete(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 1500,
    temperature: float = 0.7,
) -> str:
    """Send a completion request to Groq with retry logic."""
    client = get_client()
    if DEBUG:
        print(f"[llm] Sending request to model: {MODEL}")

    def _sync_call():
        return client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    retry=retry_if_exception(should_retry)
)
async def complete_with_history(
    system_prompt: str,
    history: List[Dict],
    max_tokens: int = 1500,
    temperature: float = 0.7,
) -> str:
    client = get_client()
    messages = [{"role": "system", "content": system_prompt}] + history

    def _sync_call():
        return client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


def parse_json_response(text: str) -> Optional[dict]:
    import json, re
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("```").strip()
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None
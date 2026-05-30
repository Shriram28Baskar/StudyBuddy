import os
from serpapi import GoogleSearch
from dotenv import load_dotenv

load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_API_KEY", "")


def _search(query: str, num_results: int = 5) -> list[dict]:
    """Run a Google search via SerpAPI and return organic results."""
    if not SERPAPI_KEY:
        return []
    params = {
        "engine":  "google",
        "q":       query,
        "num":     num_results,
        "api_key": SERPAPI_KEY,
    }
    search  = GoogleSearch(params)
    results = search.get_dict()
    return results.get("organic_results", [])


def _format_results(results: list[dict]) -> str:
    """Convert SerpAPI results to a compact text block for LLM context."""
    if not results:
        return "No web search results available."
    lines = []
    for r in results:
        title   = r.get("title", "")
        snippet = r.get("snippet", "")
        link    = r.get("link", "")
        lines.append(f"- {title}: {snippet} ({link})")
    return "\n".join(lines)


# ── Public helpers ────────────────────────────────────────────────────

def search_roadmap_data(goal: str) -> str:
    """Fetch skills, courses, and market info for a learning goal."""
    results = _search(f"{goal} learning roadmap skills 2024", num_results=5)
    results += _search(f"best courses to learn {goal}", num_results=3)
    return _format_results(results)


def search_career_data(skills: list[str], interests: list[str]) -> str:
    """Fetch job market data relevant to a user's skills and interests."""
    skills_str    = " ".join(skills[:3])
    interests_str = " ".join(interests[:3])
    results  = _search(f"{skills_str} career options salary 2024", num_results=4)
    results += _search(f"{interests_str} {skills_str} job roles", num_results=4)
    return _format_results(results)
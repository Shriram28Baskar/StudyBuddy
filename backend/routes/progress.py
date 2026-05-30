from fastapi import APIRouter, HTTPException
from models.progress import ProgressEntry
from services import firebase
from services.llm import complete

router = APIRouter()


@router.post("")
async def log_score(req: ProgressEntry):
    """Log a test score for a user."""
    try:
        previous = firebase.get_progress(req.user_id, subject=req.subject)
        trend = None
        if previous:
            last_score = previous[-1].get("score", 0)
            trend = round(req.score - last_score, 2)

        entry_id = firebase.save_progress_entry(
            user_id=req.user_id,
            subject=req.subject,
            score=req.score,
            test_name=req.test_name,
        )
        return {"entry_id": entry_id, "trend": trend, "message": "Score logged successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log score: {str(e)}")


@router.get("/{user_id}")
async def get_progress(user_id: str, subject: str = None):
    """Fetch progress history for a user."""
    try:
        entries = firebase.get_progress(user_id, subject=subject)
        stats = {}
        for e in entries:
            subj = e.get("subject", "Unknown")
            if subj not in stats:
                stats[subj] = {"scores": [], "count": 0}
            stats[subj]["scores"].append(e.get("score", 0))
            stats[subj]["count"] += 1

        subject_stats = []
        for subj, data in stats.items():
            scores = data["scores"]
            avg    = round(sum(scores) / len(scores), 1)
            trend  = round(scores[-1] - scores[-2], 1) if len(scores) > 1 else 0
            subject_stats.append({
                "subject": subj,
                "avg":     avg,
                "latest":  scores[-1],
                "trend":   trend,
                "count":   data["count"],
            })

        return {
            "entries":       entries,
            "subject_stats": subject_stats,
            "total_tests":   len(entries),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch progress: {str(e)}")


@router.post("/{user_id}/analysis")
async def analyze_progress(user_id: str):
    """Use Groq to analyze a user's progress."""
    try:
        entries = firebase.get_progress(user_id)
        if not entries:
            raise HTTPException(status_code=404, detail="No progress data found.")

        subject_scores = {}
        for e in entries:
            subj  = e.get("subject", "Unknown")
            score = float(e.get("score", 0))
            subject_scores.setdefault(subj, []).append(score)

        summary_lines = []
        for subj, scores in subject_scores.items():
            avg = round(sum(scores) / len(scores), 1)
            summary_lines.append(f"- {subj}: avg {avg}%, tests: {len(scores)}, scores: {scores}")

        system_prompt = """You are an academic performance coach. Analyze the student's scores and provide:
1. Overall assessment (2-3 sentences)
2. Top 2-3 weak areas
3. Top 2-3 strong areas
4. 3 actionable recommendations
Be encouraging but honest."""

        analysis = await complete(
            system_prompt=system_prompt,
            user_message="Student data:\n" + "\n".join(summary_lines),
            temperature=0.5,
        )
        return {"analysis": analysis, "subject_count": len(subject_scores)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
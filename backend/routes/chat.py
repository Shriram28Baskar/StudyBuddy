from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.llm import build_tutor_prompt, complete, complete_with_history
from services import firebase

router = APIRouter()


# ── Request/Response Models ───────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str
    subject: str = "General"
    topic: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str


# ── Main Chat Endpoint ────────────────────────────────────────────────
@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Chat endpoint that accepts the frontend's payload.
    Uses history (if provided) for multi-turn conversation.
    """
    try:
        system_prompt = build_tutor_prompt(
            subject=req.subject,
            topic=req.topic or "general",
            level="intermediate",  # ← hardcoded default
        )

        # If history is provided, use it; otherwise treat as single-turn
        if req.history:
            # Append the current message to the history
            full_history = req.history + [{"role": "user", "content": req.message}]
            answer = await complete_with_history(system_prompt, full_history)
        else:
            answer = await complete(system_prompt, req.message)

        return ChatResponse(reply=answer)

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ── Legacy endpoints (optional, keep for backward compatibility) ──────
class LegacyChatRequest(BaseModel):
    question: str
    subject: str = "General"
    topic: str = ""
    level: str = "beginner"
    user_id: Optional[str] = None


class LegacyChatResponse(BaseModel):
    answer: str
    subject: str
    topic: str
    session_id: Optional[str] = None


class MessageItem(BaseModel):
    role: str
    content: str


class ChatHistoryRequest(BaseModel):
    user_id: Optional[str] = None
    messages: List[MessageItem]
    subject: str = "General"
    topic: str = ""
    level: str = "beginner"


@router.post("/legacy", response_model=LegacyChatResponse)
async def ask_doubt(req: LegacyChatRequest):
    """Single-turn AI doubt solver (legacy)."""
    try:
        system_prompt = build_tutor_prompt(req.subject, req.topic, req.level)
        answer = await complete(system_prompt, req.question)

        session_id: Optional[str] = None
        if req.user_id:
            try:
                session_id = firebase.save_conversation(
                    user_id=req.user_id,
                    messages=[
                        {"role": "user", "content": req.question},
                        {"role": "assistant", "content": answer},
                    ],
                    subject=req.subject,
                    topic=req.topic,
                )
            except Exception:
                pass

        return LegacyChatResponse(
            answer=answer,
            subject=req.subject,
            topic=req.topic,
            session_id=session_id,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/history", response_model=LegacyChatResponse)
async def ask_with_history(req: ChatHistoryRequest):
    """Multi-turn chat with full conversation history."""
    try:
        system_prompt = build_tutor_prompt(req.subject, req.topic, req.level)
        history = [
            {"role": m.role, "content": m.content}
            for m in req.messages
        ]
        answer = await complete_with_history(system_prompt, history)

        return LegacyChatResponse(
            answer=answer,
            subject=req.subject,
            topic=req.topic,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.get("/history/{user_id}")
async def get_history(user_id: str, limit: int = 20):
    """Retrieve conversation history from Firestore."""
    try:
        conversations = firebase.get_conversations(user_id, limit=limit)
        return {"conversations": conversations, "count": len(conversations)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")
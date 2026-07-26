from typing import Optional, List, Dict

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field, model_validator

from services.llm import build_tutor_prompt, build_rag_prompt, complete, complete_with_history
from services.rag import ingest_document, query_document, ALLOWED_EXTENSIONS
from services.vectorstore import collection_exists
from services.serp import search_images
from services import firebase

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared request / response models
#
# Root cause of the original bug:
#   - The primary POST / handler defined its own inline model with `message`.
#   - The legacy handlers (and tests) used `question`.
#   - There was no shared model, so /chat expected `message` while
#     tests/legacy clients sent `question` → 422 Unprocessable Entity.
#
# Fix:
#   - One canonical ChatRequest that accepts BOTH `question` and `message`.
#   - A @model_validator normalises whichever field is supplied into a single
#     internal `question` field used by all handlers.
#   - Clients sending either field name will now succeed.
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    """
    Unified chat request.

    Accepts `question` (canonical, used by legacy clients and tests) OR
    `message` (used by newer frontend). Exactly one must be present.
    The validator normalises the value into `question` so all handlers
    read from a single field.
    """
    question: Optional[str] = Field(default=None, description="Primary question field")
    message:  Optional[str] = Field(default=None, description="Alias for question (frontend compat)")
    subject:  str            = Field(default="General")
    topic:    Optional[str]  = None
    level:    str            = Field(default="intermediate")
    history:  Optional[List[Dict[str, str]]] = Field(default_factory=list)
    user_id:  Optional[str]  = None

    @model_validator(mode="after")
    def normalise_question_field(self) -> "ChatRequest":
        """
        Accept either `question` or `message`; resolve to `question`.
        Raises ValueError (→ 422) only when both are absent.
        """
        if self.question and self.message:
            # Both supplied — prefer `question`, silently ignore `message`
            self.message = None
        elif self.message and not self.question:
            self.question = self.message
            self.message  = None
        elif not self.question and not self.message:
            raise ValueError("Either 'question' or 'message' must be provided.")
        return self


class ChatResponse(BaseModel):
    reply:      str
    answer:     str            # alias kept for legacy consumers
    subject:    str
    topic:      str
    session_id: Optional[str] = None

    @classmethod
    def build(
        cls,
        answer: str,
        subject: str,
        topic: str,
        session_id: Optional[str] = None,
    ) -> "ChatResponse":
        return cls(
            reply=answer,        # primary (new clients)
            answer=answer,       # alias  (legacy clients)
            subject=subject,
            topic=topic or "",
            session_id=session_id,
        )


class MessageItem(BaseModel):
    role:    str
    content: str


class ChatHistoryRequest(BaseModel):
    user_id:  Optional[str]       = None
    messages: List[MessageItem]
    subject:  str                 = "General"
    topic:    str                 = ""
    level:    str                 = "beginner"


# ---------------------------------------------------------------------------
# Document query request model
# ---------------------------------------------------------------------------

class DocQueryRequest(BaseModel):
    """Query previously uploaded documents with conversation history."""
    doc_id:   Optional[str] = None
    doc_ids:  Optional[List[str]] = None
    question: Optional[str] = None
    message:  Optional[str] = None
    history:  Optional[List[Dict[str, str]]] = Field(default_factory=list)
    top_k:    int = Field(default=5, ge=1, le=10)

    @model_validator(mode="after")
    def normalise(self) -> "DocQueryRequest":
        if self.message and not self.question:
            self.question = self.message
            self.message  = None
        elif not self.question and not self.message:
            raise ValueError("Either 'question' or 'message' must be provided.")
        # Normalise doc_id / doc_ids
        if self.doc_id and not self.doc_ids:
            self.doc_ids = [self.doc_id]
        elif not self.doc_ids:
            raise ValueError("Either 'doc_id' or 'doc_ids' must be provided.")
        return self


class DocQueryResponse(BaseModel):
    reply:   str
    sources: List[str] = []


class DocUploadResponse(BaseModel):
    doc_id:      str
    filename:    str
    chunk_count: int
    message:     str


# ---------------------------------------------------------------------------
# Primary chat endpoint  POST /
# ---------------------------------------------------------------------------

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main chat endpoint.  Accepts `question` or `message` (either works).
    Uses conversation history when provided.
    """
    try:
        system_prompt = build_tutor_prompt(
            subject=req.subject,
            topic=req.topic or "general",
            level=req.level,
        )

        if req.history:
            full_history = req.history + [{"role": "user", "content": req.question}]
            answer = await complete_with_history(system_prompt, full_history)
        else:
            answer = await complete(system_prompt, req.question)

        # Optionally persist when user_id is present
        session_id: Optional[str] = None
        if req.user_id:
            try:
                session_id = firebase.save_conversation(
                    user_id=req.user_id,
                    messages=[
                        {"role": "user",      "content": req.question},
                        {"role": "assistant", "content": answer},
                    ],
                    subject=req.subject,
                    topic=req.topic or "",
                )
            except Exception:
                pass  # Non-fatal — don't fail the request over a save error

        return ChatResponse.build(
            answer=answer,
            subject=req.subject,
            topic=req.topic or "",
            session_id=session_id,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ---------------------------------------------------------------------------
# Document upload  POST /upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=DocUploadResponse)
async def upload_document_for_chat(file: UploadFile = File(...)):
    """
    Upload a document into the Doubt Solver session.
    Supported: pdf, txt, md, docx, pptx, csv, xlsx, xls, json
    Returns a doc_id to use in /chat/doc-query requests.
    """
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported file type '.{ext}'. "
                f"Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
            ),
        )
    try:
        meta = await ingest_document(file)
        return DocUploadResponse(
            doc_id=meta["doc_id"],
            filename=meta["filename"],
            chunk_count=meta["chunk_count"],
            message=f"Document ready! {meta['chunk_count']} sections indexed. Ask me anything about it.",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ---------------------------------------------------------------------------
# Document Q&A  POST /doc-query
# ---------------------------------------------------------------------------

@router.post("/doc-query", response_model=DocQueryResponse)
async def query_uploaded_document(req: DocQueryRequest):
    """
    Answer a question using one or more previously uploaded documents (RAG).
    Supports both single doc_id and multiple doc_ids for multi-document context.
    """
    # Validate all doc_ids exist
    missing = [did for did in req.doc_ids if not collection_exists(did)]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Document(s) not found: {', '.join(missing[:3])}. Please re-upload.",
        )
    try:
        # Retrieve relevant chunks from all documents
        all_chunks = []
        per_doc_k = max(2, req.top_k // len(req.doc_ids)) if len(req.doc_ids) > 1 else req.top_k
        for did in req.doc_ids:
            chunks = await query_document(
                collection_name=did,
                question=req.question,
                top_k=per_doc_k,
            )
            all_chunks.extend(chunks)

        if not all_chunks:
            return DocQueryResponse(
                reply="I couldn't find relevant content in the document(s) for that question.",
                sources=[],
            )

        # Build RAG system prompt
        system_prompt = build_rag_prompt(all_chunks, req.question)

        # Support follow-up questions using history
        if req.history:
            full_history = req.history + [{"role": "user", "content": req.question}]
            answer = await complete_with_history(system_prompt, full_history)
        else:
            answer = await complete(system_prompt, req.question)

        # Trim sources for display
        sources = [c[:200] + "…" if len(c) > 200 else c for c in all_chunks]
        return DocQueryResponse(reply=answer, sources=sources)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


# ---------------------------------------------------------------------------
# Visual image search  GET /visual-search
# ---------------------------------------------------------------------------

@router.get("/visual-search")
async def visual_image_search(q: str):
    """
    Search for educational images/diagrams relevant to a query.
    Returns up to 3 image results: {url, title, source}.
    Results are cached for 1 hour server-side.
    """
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query 'q' must not be empty.")
    try:
        images = search_images(q.strip(), num=3)
        return {"images": images, "query": q.strip()}
    except Exception as e:
        # Graceful degradation — callers should handle empty images list
        return {"images": [], "query": q.strip(), "error": str(e)}


# ---------------------------------------------------------------------------
# Multi-turn history endpoint  POST /history
# ---------------------------------------------------------------------------

@router.post("/history", response_model=ChatResponse)
async def ask_with_history(req: ChatHistoryRequest):
    """Multi-turn chat with full conversation history."""
    try:
        system_prompt = build_tutor_prompt(req.subject, req.topic, req.level)
        history = [{"role": m.role, "content": m.content} for m in req.messages]
        answer  = await complete_with_history(system_prompt, history)

        return ChatResponse.build(
            answer=answer,
            subject=req.subject,
            topic=req.topic,
        )

    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


# ---------------------------------------------------------------------------
# Retrieve history  GET /history/{user_id}
#
# NOTE: must be declared AFTER POST /history so FastAPI doesn't swallow
# the POST with the GET handler's path — though different HTTP methods
# make this safe here, keeping the order explicit is good practice.
# ---------------------------------------------------------------------------

@router.get("/history/{user_id}")
async def get_history(user_id: str, limit: int = 20):
    """Retrieve conversation history from Firestore."""
    try:
        conversations = firebase.get_conversations(user_id, limit=limit)
        return {"conversations": conversations, "count": len(conversations)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")
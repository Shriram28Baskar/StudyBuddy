from typing import Optional, List
from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question:   str = Field(..., min_length=1, max_length=1000)
    collection: str = Field(..., description="Collection name (document ID)")
    top_k:      int = Field(default=5, ge=1, le=20)


class VisualEvidence(BaseModel):
    """A single retrieved visual element (diagram, table, figure, etc.)."""
    page:       int
    type:       str            # e.g. "weighted_graph", "flowchart", "table"
    confidence: float          # classification confidence 0.0–1.0
    reason:     str            # truncated caption used as retrieval reason
    url:        str            # static image URL served by FastAPI


class QueryResponse(BaseModel):
    answer:               str
    sources:              List[str]
    doc_name:             Optional[str] = None
    visual_evidence:      List[VisualEvidence] = []
    page_refs:            List[int] = []
    query_intent:         Optional[str] = None
    retrieval_confidence: Optional[str] = None    # "high" | "medium" | "low"
    insufficient_evidence: bool = False


class Topic(BaseModel):
    title:       str
    description: str
    subtopics:   List[str]


class UploadResponse(BaseModel):
    doc_id:      str
    filename:    str
    chunk_count: int
    image_count: int = 0
    message:     str
    topics:      Optional[List[Topic]] = None
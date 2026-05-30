from typing import Optional, List
from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question:   str          = Field(..., min_length=1, max_length=1000)
    collection: str          = Field(..., description="Collection name (document ID)")
    top_k:      int          = Field(default=5, ge=1, le=20)


class QueryResponse(BaseModel):
    answer:   str
    sources:  List[str]
    doc_name: Optional[str] = None


class UploadResponse(BaseModel):
    doc_id:      str
    filename:    str
    chunk_count: int
    message:     str
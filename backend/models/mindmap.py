from typing import List
from pydantic import BaseModel, Field


class MindMapRequest(BaseModel):
    topic: str = Field(..., min_length=1, max_length=200)
    depth: int = Field(default=2, ge=1, le=3)


class MindMapNode(BaseModel):
    name:     str
    children: List[str] = []


class MindMapResponse(BaseModel):
    topic: str
    nodes: List[MindMapNode]
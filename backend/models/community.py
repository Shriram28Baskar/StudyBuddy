from typing import Literal
from pydantic import BaseModel, Field
from datetime import datetime


class PostRequest(BaseModel):
    user_id: str
    title:   str  = Field(..., min_length=1, max_length=200)
    body:    str  = Field(..., min_length=1, max_length=5000)
    tag:     Literal["Study Plan", "Discussion", "Tips", "Doubt", "Resource"] = "Discussion"


class CommentRequest(BaseModel):
    post_id: str
    user_id: str
    text:    str = Field(..., min_length=1, max_length=1000)


class PostResponse(BaseModel):
    id:        str
    user_id:   str
    title:     str
    body:      str
    tag:       str
    likes:     int      = 0
    comments:  int      = 0
    timestamp: datetime
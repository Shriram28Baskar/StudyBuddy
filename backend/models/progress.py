from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class ProgressEntry(BaseModel):
    user_id:   str
    subject:   str   = Field(..., max_length=100)
    score:     float = Field(..., ge=0, le=100)
    test_name: str   = Field(default="", max_length=200)


class ProgressResponse(BaseModel):
    entry_id:  str
    subject:   str
    score:     float
    timestamp: datetime
    trend:     Optional[float] = None
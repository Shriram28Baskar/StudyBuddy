from typing import Optional, Literal
from pydantic import BaseModel, Field
from enum import Enum


class Level(str, Enum):
    beginner     = "beginner"
    intermediate = "intermediate"
    advanced     = "advanced"


class ChatRequest(BaseModel):
    question:   str            = Field(..., min_length=1, max_length=2000)
    subject:    str            = Field(default="General", max_length=100)
    topic:      str            = Field(default="", max_length=200)
    level:      Level          = Field(default=Level.beginner)
    user_id:    Optional[str]  = None


class Message(BaseModel):
    role:    Literal["user", "assistant"]
    content: str


class ChatHistoryRequest(BaseModel):
    user_id:  str
    messages: list
    subject:  str   = "General"
    topic:    str   = ""
    level:    Level = Level.beginner


class ChatResponse(BaseModel):
    answer:     str
    subject:    str
    topic:      str
    session_id: Optional[str] = None
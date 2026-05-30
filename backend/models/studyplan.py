from typing import Optional, List, Annotated
from pydantic import BaseModel, Field
from datetime import date


class StudyPlanRequest(BaseModel):
    exam:          str                        = Field(..., min_length=1, max_length=200)
    subjects:      Annotated[List[str], Field(min_length=1)]
    exam_date:     date                       = Field(...)
    hours_per_day: float                      = Field(..., ge=1, le=16)
    user_id:       Optional[str]              = None


class Task(BaseModel):
    subject: str
    topic:   str
    hours:   float


class DayPlan(BaseModel):
    day:   str
    date:  str
    tasks: List[Task]


class StudyPlanResponse(BaseModel):
    plan:    List[DayPlan]
    summary: str
    plan_id: Optional[str] = None
from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.llm import build_career_prompt, complete, parse_json_response
from services.serp import search_career_data

router = APIRouter()


class CareerRequest(BaseModel):
    skills:    List[str] = Field(..., min_length=1, max_length=20)
    interests: List[str] = Field(default_factory=list, max_length=10)


class CareerRole(BaseModel):
    title:    str
    salary:   str
    match:    int
    skills:   List[str]
    nextStep: str


class CareerResponse(BaseModel):
    roles: List[CareerRole]


@router.post("", response_model=CareerResponse)
async def get_career_guidance(req: CareerRequest):
    """Generate personalized career guidance using SerpAPI + Groq."""
    try:
        serp_data = search_career_data(req.skills, req.interests)
        system_prompt = build_career_prompt(req.skills, req.interests, serp_data)
        raw  = await complete(system_prompt, "Generate career guidance.", temperature=0.6)
        data = parse_json_response(raw)

        if not data or "roles" not in data:
            raise ValueError("LLM returned malformed career guidance JSON.")

        roles = [
            CareerRole(
                title=r.get("title", ""),
                salary=r.get("salary", ""),
                match=int(r.get("match", 0)),
                skills=r.get("skills", []),
                nextStep=r.get("nextStep", ""),
            )
            for r in data["roles"]
        ]
        roles.sort(key=lambda r: r.match, reverse=True)
        return CareerResponse(roles=roles)

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Career guidance failed: {str(e)}")
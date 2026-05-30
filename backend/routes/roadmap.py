from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from services.llm import build_roadmap_prompt, complete, parse_json_response
from services.serp import search_roadmap_data

router = APIRouter()


class RoadmapRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=300)


class RoadmapResource(BaseModel):
    title: str
    url: Optional[str] = ""
    type: Optional[str] = "article"
    description: Optional[str] = ""


class RoadmapPhase(BaseModel):
    phase:       str
    title:       str
    duration:    str
    description: Optional[str] = ""
    skills:      List[str]
    resources:   List[RoadmapResource]


class RoadmapResponse(BaseModel):
    goal:          str
    estimatedTime: Optional[str] = None
    phases:        List[RoadmapPhase]


@router.post("", response_model=RoadmapResponse)
async def generate_roadmap(req: RoadmapRequest):
    """Generate a detailed phased learning roadmap using SerpAPI + Groq."""
    try:
        serp_data = search_roadmap_data(req.goal)
        system_prompt = build_roadmap_prompt(req.goal, serp_data)

        # Increased max_tokens to 4000 to allow rich, detailed responses
        raw = await complete(
            system_prompt,
            f"Create a detailed, elaborate 6-phase learning roadmap for: {req.goal}",
            temperature=0.6,
            max_tokens=4000
        )
        data = parse_json_response(raw)

        if not data or "phases" not in data:
            raise ValueError("LLM returned malformed roadmap JSON.")

        phases = []
        for p in data["phases"]:
            # Normalize resources — handle both string and object formats
            raw_resources = p.get("resources", [])
            normalized_resources = []
            for r in raw_resources:
                if isinstance(r, str):
                    normalized_resources.append(RoadmapResource(title=r))
                elif isinstance(r, dict):
                    normalized_resources.append(RoadmapResource(
                        title=r.get("title") or r.get("name", "Resource"),
                        url=r.get("url") or r.get("link") or "",
                        type=r.get("type", "article"),
                        description=r.get("description", "")
                    ))

            phases.append(RoadmapPhase(
                phase=p.get("phase", ""),
                title=p.get("title", ""),
                duration=p.get("duration", ""),
                description=p.get("description", ""),
                skills=p.get("skills", []),
                resources=normalized_resources,
            ))

        return RoadmapResponse(
            goal=data.get("goal", req.goal),
            estimatedTime=data.get("estimatedTime", None),
            phases=phases
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Roadmap generation failed: {str(e)}")
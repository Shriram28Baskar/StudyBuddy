from typing import List
from fastapi import APIRouter, HTTPException
from models.mindmap import MindMapRequest, MindMapResponse, MindMapNode
from services.llm import build_mindmap_prompt, complete, parse_json_response

router = APIRouter()


@router.post("", response_model=MindMapResponse)
async def generate_mind_map(req: MindMapRequest):
    """Generate a structured mind map JSON for a given topic."""
    try:
        system_prompt = build_mindmap_prompt(req.topic)
        raw  = await complete(system_prompt, f"Generate mind map for: {req.topic}", temperature=0.6)
        data = parse_json_response(raw)

        if not data or "nodes" not in data:
            raise ValueError("LLM returned malformed mind map JSON.")

        nodes = [
            MindMapNode(
                name=n.get("name", ""),
                children=n.get("children", []),
            )
            for n in data["nodes"]
        ]
        return MindMapResponse(topic=data.get("topic", req.topic), nodes=nodes)

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mind map generation failed: {str(e)}")
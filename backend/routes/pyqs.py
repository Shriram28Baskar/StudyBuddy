"""
PYQs Analyzer Route
Analyzes previous year question papers (PDFs) and provides:
- Important Questions (chapter-wise, by mark category)
- Important Topics (chapter-wise, by mark category)
- Model Question Paper (mirroring uploaded paper blueprint)
"""
import json
import re
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from services.llm import complete
from services.rag import extract_text_from_pdf_bytes

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────

class ImportantQuestion(BaseModel):
    question: str
    frequency: Optional[int] = None
    years: Optional[List[str]] = []


class ChapterQuestions(BaseModel):
    chapter: str
    two_mark: List[ImportantQuestion]
    high_mark: List[ImportantQuestion]  # 16M for Semester, 12M for CAE


class ChapterTopics(BaseModel):
    chapter: str
    two_mark_topics: List[str]
    high_mark_topics: List[str]


class ModelPaper(BaseModel):
    title: str
    instructions: List[str]
    two_mark_questions: List[str]
    high_mark_questions: List[str]
    blueprint_notes: Optional[str] = None


class AnalysisResult(BaseModel):
    model_config = {'protected_namespaces': ()}

    mode: str  # "semester" | "cae"
    chapters_detected: List[str]
    important_questions: List[ChapterQuestions]
    important_topics: List[ChapterTopics]
    model_paper: ModelPaper
    raw_text_preview: Optional[str] = None


# ── LLM Prompts ───────────────────────────────────────────────────────

def build_analysis_prompt(combined_text: str, mode: str) -> str:
    chapter_count = 5 if mode == "semester" else 2
    high_mark = 16 if mode == "semester" else 12
    model_paper_high = f"10 × {high_mark}-mark questions"

    return f"""You are an expert academic analyzer specializing in engineering exam papers.

You have been given the full text of {chapter_count}-chapter {"Semester" if mode == "semester" else "CAE (Continuous Assessment)"} exam question papers.

EXAM TYPE: {"Semester (5 chapters, 2-mark and 16-mark questions)" if mode == "semester" else "CAE (2 chapters, 2-mark and 12-mark questions)"}

UPLOADED PAPER TEXT:
{combined_text[:12000]}

Your task: Analyze these papers deeply and return a single JSON object.

RULES:
1. Detect exactly {chapter_count} chapters from the paper content (use chapter names/numbers found in the text)
2. For Important Questions: identify top 4 most frequently appearing OR high-priority questions per chapter per mark category
3. For Important Topics: identify recurring themes/topics per chapter per mark category
4. For Model Paper: mirror the EXACT structural blueprint (section layout, instructions, question ordering style) of the uploaded papers
5. All output must be grounded in the uploaded content — no hallucination

Return ONLY this JSON (no markdown, no explanation):
{{
  "chapters_detected": ["Chapter 1: Title", "Chapter 2: Title", ...],
  "important_questions": [
    {{
      "chapter": "Chapter 1: Title",
      "two_mark": [
        {{"question": "Define X. What is Y?", "frequency": 3, "years": ["2022", "2023"]}},
        {{"question": "...", "frequency": 2, "years": []}},
        {{"question": "...", "frequency": 2, "years": []}},
        {{"question": "...", "frequency": 1, "years": []}}
      ],
      "high_mark": [
        {{"question": "Explain X in detail with diagram.", "frequency": 4, "years": ["2021","2022","2023"]}},
        {{"question": "...", "frequency": 2, "years": []}},
        {{"question": "...", "frequency": 2, "years": []}},
        {{"question": "...", "frequency": 1, "years": []}}
      ]
    }}
  ],
  "important_topics": [
    {{
      "chapter": "Chapter 1: Title",
      "two_mark_topics": ["Topic A", "Topic B", "Topic C"],
      "high_mark_topics": ["Topic X", "Topic Y", "Topic Z"]
    }}
  ],
  "model_paper": {{
    "title": "Model {("Semester" if mode == "semester" else "CAE")} Question Paper",
    "instructions": ["Answer ALL questions", "Part A: 10 × 2 = 20 marks", "Part B: {model_paper_high} = {10*high_mark} marks"],
    "two_mark_questions": [
      "1. Question text here?",
      "2. Question text here?",
      "3. Question text here?",
      "4. Question text here?",
      "5. Question text here?",
      "6. Question text here?",
      "7. Question text here?",
      "8. Question text here?",
      "9. Question text here?",
      "10. Question text here?"
    ],
    "high_mark_questions": [
      "11. (a) Question text OR (b) Alternative question",
      "12. (a) Question text OR (b) Alternative question",
      "13. (a) Question text OR (b) Alternative question",
      "14. (a) Question text OR (b) Alternative question",
      "15. (a) Question text OR (b) Alternative question",
      "16. (a) Question text OR (b) Alternative question",
      "17. (a) Question text OR (b) Alternative question",
      "18. (a) Question text OR (b) Alternative question",
      "19. (a) Question text OR (b) Alternative question",
      "20. (a) Question text OR (b) Alternative question"
    ],
    "blueprint_notes": "Brief note on structural pattern observed in uploaded papers"
  }}
}}

Ensure exactly {chapter_count} chapters, exactly 4 questions per chapter per mark category in important_questions, and exactly 10 questions each in the model paper sections."""


# ── Route ─────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_pyqs(
    mode: str = Form(...),  # "semester" or "cae"
    files: List[UploadFile] = File(...),
):
    """
    Analyze uploaded PYQ PDFs and return important questions, topics, and a model paper.
    """
    if mode not in ("semester", "cae"):
        raise HTTPException(status_code=400, detail="Mode must be 'semester' or 'cae'")

    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required")

    # Extract text from all uploaded PDFs
    combined_texts = []
    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"File '{file.filename}' is not a PDF. Only PDF files are supported."
            )
        content = await file.read()
        if len(content) > 20 * 1024 * 1024:  # 20MB limit
            raise HTTPException(status_code=400, detail=f"File '{file.filename}' exceeds 20MB limit")
        try:
            text = extract_text_from_pdf_bytes(content)
            if text.strip():
                combined_texts.append(f"=== FILE: {file.filename} ===\n{text}")
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    if not combined_texts:
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from uploaded PDFs. Ensure they are not scanned images."
        )

    combined_text = "\n\n".join(combined_texts)
    # Clean up excessive spacing/newlines to optimize token usage
    combined_text = re.sub(r'[ \t]+', ' ', combined_text)
    combined_text = re.sub(r'\n{3,}', '\n\n', combined_text)
    combined_text = combined_text.strip()

    # Build prompt and call LLM
    system_prompt = build_analysis_prompt(combined_text, mode)

    try:
        raw = await complete(
            system_prompt=system_prompt,
            user_message=f"Analyze these {mode} exam papers and return the JSON.",
            max_tokens=4000,
            temperature=0.2,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")

    # Parse JSON response
    raw_clean = re.sub(r"```(?:json)?\s*", "", raw.strip()).replace("```", "").strip()
    match = re.search(r"\{[\s\S]*\}", raw_clean)
    if not match:
        raise HTTPException(status_code=502, detail="AI returned malformed analysis. Please retry.")

    json_str = match.group()
    # Fix common JSON issues
    json_str += "]" * max(0, json_str.count("[") - json_str.count("]"))
    json_str += "}" * max(0, json_str.count("{") - json_str.count("}"))

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON. Please retry.")

    high_mark = 16 if mode == "semester" else 12

    # Normalize and validate
    chapters = data.get("chapters_detected", [])
    if not chapters:
        raise HTTPException(status_code=502, detail="Could not detect chapters from the uploaded papers.")

    # Build response
    important_questions = []
    for ch_data in data.get("important_questions", []):
        two_mark = [
            ImportantQuestion(
                question=q.get("question", ""),
                frequency=q.get("frequency"),
                years=q.get("years", []),
            )
            for q in ch_data.get("two_mark", [])
        ]
        high_mark_qs = [
            ImportantQuestion(
                question=q.get("question", ""),
                frequency=q.get("frequency"),
                years=q.get("years", []),
            )
            for q in ch_data.get("high_mark", [])
        ]
        important_questions.append(ChapterQuestions(
            chapter=ch_data.get("chapter", ""),
            two_mark=two_mark,
            high_mark=high_mark_qs,
        ))

    important_topics = []
    for ch_data in data.get("important_topics", []):
        important_topics.append(ChapterTopics(
            chapter=ch_data.get("chapter", ""),
            two_mark_topics=ch_data.get("two_mark_topics", []),
            high_mark_topics=ch_data.get("high_mark_topics", []),
        ))

    mp = data.get("model_paper", {})
    model_paper = ModelPaper(
        title=mp.get("title", f"Model {'Semester' if mode == 'semester' else 'CAE'} Question Paper"),
        instructions=mp.get("instructions", []),
        two_mark_questions=mp.get("two_mark_questions", []),
        high_mark_questions=mp.get("high_mark_questions", []),
        blueprint_notes=mp.get("blueprint_notes"),
    )

    return AnalysisResult(
        mode=mode,
        chapters_detected=chapters,
        important_questions=important_questions,
        important_topics=important_topics,
        model_paper=model_paper,
        raw_text_preview=combined_text[:500] + "..." if len(combined_text) > 500 else combined_text,
    )

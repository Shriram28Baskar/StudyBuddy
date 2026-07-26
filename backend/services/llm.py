import asyncio
import os
from typing import Optional, List, Dict
from groq import Groq
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception, retry_if_exception_type
from dotenv import load_dotenv
from utils.json_helper import extract_json_object

load_dotenv()

_client: Optional[Groq] = None

# Detect if we're in development to print debug info
DEBUG = os.getenv("DEBUG", "false").lower() == "true"

def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in environment")
        # Print first few characters for verification (safe)
        if DEBUG:
            print(f"[llm] Using Groq API key starting with: {api_key[:8]}...")
        _client = Groq(api_key=api_key)
    return _client

def should_retry(e: BaseException) -> bool:
    if isinstance(e, RuntimeError) and "GROQ_API_KEY" in str(e):
        return False
    return isinstance(e, Exception)

# Switch to a smaller, cheaper model to stay under daily limits
# The default model now is llama-3.1-8b-instant (~1/10th tokens of 70b model)
MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")


def build_tutor_prompt(subject: str, topic: str, level: str) -> str:
    return f"""You are a personalized AI tutor specializing in academic subjects.

User context:
- Subject: {subject}
- Topic: {topic or "general"}
- Level: {level}

When answering:
1. Give a clear, simple explanation appropriate for the level
2. Provide a concrete example
3. List 3-5 key takeaways as bullet points

Be concise, encouraging, and accurate."""


def build_rag_prompt(context_chunks: List[str], question: str) -> str:
    context = "\n\n---\n\n".join(context_chunks)
    return f"""You are a helpful educational document assistant. Answer the user's question based on the provided document excerpts.

If the user asks for code, algorithms, explanations, or step-by-step breakdowns of concepts found in the document, you should provide both the code (wrapped in code blocks) and a clear step-by-step description of the algorithm/process, even if the retrieved text only contains the code.

CRITICAL FORMATTING RULES — you MUST follow these exactly:
1. Output ONLY the final answer. Do NOT include any attribution phrases like "According to the document...", "Based on the excerpt...", "The document states...", "From the passage...", "Extracted from...", or any similar provenance text.
2. If the answer contains code or pseudocode, wrap it in a proper markdown code block with the correct language tag and preserve indentation.
3. If the answer is a list of steps or items, format it as a proper ordered or unordered markdown list.
4. If the answer is prose, write it in clean, readable paragraphs.
5. If the concept or code is not found in the excerpts at all, respond only with: "I couldn't find that in the document."

Document excerpts (use these as your knowledge source, but do not reference them directly):
{context}

Question: {question}"""


@retry(
    stop=stop_after_attempt(5),                           # try 5 times
    wait=wait_exponential(multiplier=2, min=4, max=60),   # wait 4, 8, 16, 32, 60 seconds
    retry=retry_if_exception(should_retry)                # retry exception if not missing API key
)
async def complete(
    system_prompt: str,
    user_message: str,
    max_tokens: int = 1500,
    temperature: float = 0.7,
) -> str:
    """Send a completion request to Groq with retry logic."""
    client = get_client()
    if DEBUG:
        print(f"[llm] Sending request to model: {MODEL}")

    def _sync_call():
        return client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_message},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    retry=retry_if_exception(should_retry)
)
async def complete_with_history(
    system_prompt: str,
    history: List[Dict],
    max_tokens: int = 1500,
    temperature: float = 0.7,
) -> str:
    client = get_client()
    messages = [{"role": "system", "content": system_prompt}] + history

    def _sync_call():
        return client.chat.completions.create(
            model=MODEL,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


def parse_json_response(text: str) -> Optional[dict]:
    try:
        return extract_json_object(text, label="llm response")
    except ValueError:
        return None


async def complete_with_vision(
    image_b64: str,
    prompt: str,
    image_media_type: str = "image/jpeg",
    max_tokens: int = 1000,
) -> str:
    """
    Send a single image + text prompt to Groq's vision model.
    Uses GROQ_VISION_MODEL env var (default: meta-llama/llama-4-scout-17b-16e-instruct).
    """
    VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
    client = get_client()

    def _sync_call():
        return client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{image_media_type};base64,{image_b64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ],
            max_tokens=max_tokens,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


@retry(
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=4, max=60),
    retry=retry_if_exception(should_retry)
)
async def complete_with_vision_multimodal(
    text_context: List[str],
    images: List[dict],
    question: str,
    intent: str = "document_qa",
    max_tokens: int = 2000,
) -> str:
    """
    Vision-grounded multimodal reasoning.

    Passes the actual extracted images (base64) together with retrieved
    document text into the vision LLM. The model reasons over both the
    document text AND the actual uploaded diagrams/figures.

    Args:
        text_context: retrieved text chunks from the document
        images: list of dicts with keys:
            {
              "b64": str,           # base64-encoded image bytes
              "media_type": str,    # "image/png" or "image/jpeg"
              "caption": str,       # rich description for reference
              "page": int,          # page number in document
              "type": str,          # e.g. "weighted_graph"
            }
        question: the student's original question
        max_tokens: max response length
    """
    VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
    client = get_client()

    image_types = list({img["type"] for img in images})
    system_prompt = build_multimodal_rag_prompt(text_context, images, question, intent, image_types)

    # Build multipart user message: images first, then question text
    user_content = []
    for img in images:
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{img['media_type']};base64,{img['b64']}"
            }
        })
    user_content.append({
        "type": "text",
        "text": f"Question: {question}"
    })

    def _sync_call():
        return client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=max_tokens,
        )

    response = await asyncio.to_thread(_sync_call)
    return response.choices[0].message.content


def _get_template_instructions(intent: str, image_types: List[str]) -> str:
    """Determine the appropriate educational template based on intent and visual evidence."""
    template_type = "theory"
    
    # Map intent to base template
    if intent in ["algorithm", "programming"]:
        template_type = "algorithm"
    elif intent in ["diagram", "design"]:
        template_type = "diagram"
    elif intent in ["numerical", "equation"]:
        template_type = "numerical"
        
    # Visual evidence overrides or enhances
    if "flowchart" in image_types:
        template_type = "algorithm"
    elif any(t in image_types for t in ["weighted_graph", "architecture_diagram", "uml", "er_diagram", "circuit_diagram"]):
        if template_type == "theory":
            template_type = "diagram"
            
    instructions = ""
    
    if template_type == "theory":
        instructions = """
Use the following structured template for your response:
### Definition
(A concise definition of the core concept)
### Explanation
(A detailed explanation based on the text)
"""
        if any(t in image_types for t in ["weighted_graph", "architecture_diagram", "uml", "er_diagram", "circuit_diagram", "screenshot", "other"]):
            instructions += "### Diagram Explanation\n(MANDATORY: Describe the components in the provided diagram, and explain how they interact. Explicitly reference the diagram's page number.)\n"
        if "table" in image_types:
            instructions += "### Table Explanation\n(MANDATORY: Summarize the provided table, explain its columns, and explain why it matters. Explicitly reference the table's page number.)\n"
        instructions += """### Key Points
(Bullet points of crucial information)
### Applications / Examples
(If mentioned in the text)
### Exam Tips / Revision Notes
(A brief summary for quick review)
"""
    elif template_type == "diagram":
        instructions = """
Use the following structured template for your response:
### Diagram Overview
(High-level summary of what the diagram represents)
### Component-by-Component Explanation
(Detailed breakdown of the elements, blocks, or nodes shown in the diagram)
### Working Principle / Interaction
(How the components interact or the process flows)
### Labels & Details
(Any specific values, labels, or equations present in the diagram)
### Applications
(Where this is used, based on the text)
### Exam Tips
(Key takeaways for exams)
"""
    elif template_type == "algorithm":
        instructions = """
Use the following structured template for your response:
### Idea
(The core concept of the algorithm or process)
"""
        if "flowchart" in image_types:
            instructions += "### Flowchart Walkthrough\n(MANDATORY: Convert the flowchart into step-by-step reasoning. Format as:\nStep 1\n↓\nStep 2\n↓\nDecision\n...)\n"
        
        instructions += """### Algorithm Steps
(Step-by-step breakdown)
### Complexity
(Time and space complexity, if mentioned)
### Example / Dry Run
(If provided in the text or diagram)
"""
    elif template_type == "numerical":
        instructions = """
Use the following structured template for your response:
### Given
(Extract all given values and conditions)
### Find
(What needs to be calculated)
### Formula
(The relevant mathematical expressions)
"""
        if "equation" in image_types:
            instructions += "### Equation Explanation\n(MANDATORY: Explain every symbol in the provided equation image, derive when appropriate, and explain its usage.)\n"
        
        instructions += """### Solution
(Step-by-step substitution and calculation)
### Final Answer
(The final result)
"""

    return instructions


def build_multimodal_rag_prompt(
    context_chunks: List[str],
    images: List[dict],
    question: str,
    intent: str,
    image_types: List[str],
) -> str:
    """
    System prompt for vision-grounded multimodal reasoning.
    Informs the LLM about available document text AND the actual diagrams.
    """
    context = "\n\n---\n\n".join(context_chunks)

    image_annotations = ""
    if images:
        lines = []
        for i, img in enumerate(images, 1):
            lines.append(
                f"  Image {i} — Page {img['page']}, Type: {img['type']}\n"
                f"  Description: {img['caption']}"
            )
        image_annotations = "\n\nAvailable diagrams/figures from the document:\n" + "\n".join(lines)

    template_instructions = _get_template_instructions(intent, image_types)

    return f"""You are an expert academic tutor. You are explaining concepts to a student using THEIR uploaded document. You have access to both extracted text and actual diagrams/figures.

CRITICAL RULES:
1. DO NOT HALLUCINATE: Never invent diagrams, tables, examples, register names, graphs, or circuit values. If the information is not present in the document, state explicitly: "I couldn't find that in the document."
2. GROUND EVERY VISUAL EXPLANATION: When explaining a visual, you MUST explicitly cite it. Examples: "According to the diagram on Page 4...", "The table on Page 7 shows...", "Figure 3 illustrates...".
3. EXPLAIN RETRIEVED FIGURES: You must actively explain the visual elements provided to you. Do not ignore them.
4. If code is needed, use markdown code blocks.

{template_instructions}

Document text excerpts:
{context}
{image_annotations}"""


def build_rag_prompt(context_chunks: List[str], question: str, intent: str = "document_qa") -> str:
    """Text-only RAG system prompt."""
    context = "\n\n---\n\n".join(context_chunks)
    template_instructions = _get_template_instructions(intent, [])
    
    return f"""You are an expert academic tutor. You are explaining concepts to a student using THEIR uploaded document text.

CRITICAL RULES:
1. DO NOT HALLUCINATE: Never invent examples, values, or diagrams. If the information is not present in the document, state explicitly: "I couldn't find that in the document."
2. GROUND YOUR ANSWER: Explain the concepts based ONLY on the provided document excerpts. Do not use generic prior knowledge that contradicts or goes beyond the text.
3. Output clean markdown.

{template_instructions}

Document excerpts (use these as your knowledge source, but do not reference them directly as 'excerpts'):
{context}

Question: {question}"""


def sample_text(text: str, target_len: int = 8000, prefix_len: int = 3000, num_segments: int = 10) -> str:
    """
    Samples text to fit within target_len.
    Always includes the first prefix_len characters in full,
    and then samples num_segments evenly spaced chunks from the remaining text.
    """
    if len(text) <= target_len:
        return text

    prefix = text[:prefix_len]
    remaining_text = text[prefix_len:]

    remaining_target_len = target_len - prefix_len
    if remaining_target_len <= 0:
        return prefix

    segment_size = len(remaining_text) // num_segments
    chunk_size = remaining_target_len // num_segments

    if segment_size <= chunk_size:
        return prefix + "\n\n... [section transition] ...\n\n" + remaining_text

    chunks = [prefix]
    for i in range(num_segments):
        start = i * segment_size
        chunk = remaining_text[start : start + chunk_size].strip()
        if chunk:
            chunks.append(chunk)

    return "\n\n... [section transition] ...\n\n".join(chunks)


def build_topics_extraction_prompt(text: str) -> str:
    # Since this is an f-string, literal curly braces must be doubled.
    sampled = sample_text(text)
    return f"""You are an expert academic curriculum designer. Analyze the following document text and extract exactly 5 major study topics.
For each topic, provide:
1. A clear, concise title.
2. A short description (1-2 sentences) of what is covered.
3. A list of 3-5 specific subtopics or key concepts (as tags).

Document text snippet:
{sampled}

Return ONLY valid JSON in this exact format:
{{
  "topics": [
    {{
      "title": "Topic Title",
      "description": "Short description of the topic.",
      "subtopics": ["Subtopic 1", "Subtopic 2", "Subtopic 3"]
    }}
  ]
}}
"""
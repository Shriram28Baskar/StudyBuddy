import asyncio
import os
import traceback
from dotenv import load_dotenv
load_dotenv()

from services.llm import complete
from services.manim_service import render_manim_code

TOPIC = "Newton's Second Law"

def build_prompt(topic):
    return f"""You are an expert in Manim animations (3Blue1Brown style).
Generate a complete Manim Python script to explain: "{topic}".
Requirements:
- from manim import *
- ONE class named ExplanationScene(Scene)
- Simple animations only: Write, FadeIn, Create
- Title at top, 3 key concepts, self.wait(1) between steps
- Under 30 seconds
- NO external files
Return ONLY Python code."""

async def test():
    print("Step 1: Generating code...")
    try:
        code = await complete(
            system_prompt=build_prompt(TOPIC),
            user_message=f"Generate animation for: {TOPIC}",
            max_tokens=2000,
            temperature=0.3,
        )
        import re
        code = re.sub(r"```(?:python)?\s*", "", code).replace("```", "").strip()
        print("Code generated!")
        print(code[:300])
    except Exception as e:
        print(f"FAILED Step 1: {e}")
        traceback.print_exc()
        return

    print("\nStep 2: Rendering...")
    try:
        path = await render_manim_code(code, TOPIC)
        print(f"SUCCESS: {path}")
    except Exception as e:
        print(f"FAILED Step 2: {e}")
        traceback.print_exc()

asyncio.run(test())
import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

from services.manim_service import render_manim_code

test_code = """
from manim import *

class ExplanationScene(Scene):
    def construct(self):
        title = Text("Hello Manim", font_size=48)
        self.play(Write(title))
        self.wait(2)
"""

async def test():
    try:
        path = await render_manim_code(test_code, "test")
        print("SUCCESS:", path)
    except Exception as e:
        print("ERROR:", e)

asyncio.run(test())
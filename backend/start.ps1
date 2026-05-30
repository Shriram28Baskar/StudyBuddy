uvicorn main:app --reload --port 8000 `
  --reload-exclude "manim_temp" `
  --reload-exclude "videos" `
  --reload-exclude "chroma_db" `
  --reload-exclude "uploads"
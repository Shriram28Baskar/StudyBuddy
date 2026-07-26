uvicorn main:app --reload --port 8000 `
  --reload-exclude "chroma_db" `
  --reload-exclude "uploads"
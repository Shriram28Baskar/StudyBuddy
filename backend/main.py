import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response
from contextlib import asynccontextmanager
from routes import study_plans

from routes import chat, documents, roadmap, career, mindmap, progress, manim, studyplan, studyplan_ai, community
from services.vectorstore import init_vectorstore

VIDEOS_DIR = os.path.abspath(os.getenv("VIDEOS_DIR", "./videos"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate critical env vars at startup
    import os as _os
    if not _os.getenv("GROQ_API_KEY"):
        print("[WARNING] GROQ_API_KEY is not set — LLM calls will fail.")
    if not _os.path.exists(_os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "./serviceAccountKey.json")):
        if not _os.getenv("FIREBASE_PRIVATE_KEY"):
            print("[WARNING] Firebase credentials missing — Firestore calls will fail.")
    init_vectorstore()
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    yield
    from routes import manim
    manim.shutdown_pool()


app = FastAPI(title="AI StudyBuddy API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(VIDEOS_DIR, exist_ok=True)
app.mount("/videos", StaticFiles(directory=VIDEOS_DIR), name="videos")

app.include_router(chat.router,          prefix="/chat",                 tags=["Chat"])
app.include_router(documents.router,     prefix="/documents",            tags=["Documents"])
app.include_router(roadmap.router,       prefix="/roadmap",              tags=["Roadmap"])
app.include_router(career.router,        prefix="/career",               tags=["Career"])
app.include_router(mindmap.router,       prefix="/mindmap",              tags=["Mind Map"])
app.include_router(progress.router,      prefix="/progress",             tags=["Progress"])
app.include_router(manim.router,         prefix="/generate-visual",      tags=["Visual"])
app.include_router(studyplan.router,     prefix="/studyplan",            tags=["Study Plan"])
app.include_router(study_plans.router,   prefix="/api",                  tags=["Study Plans"])
app.include_router(studyplan_ai.router,  prefix="/generate-study-plan",  tags=["Study Plan AI"])
app.include_router(community.router,     prefix="/community",            tags=["Community"])


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "AI StudyBuddy API is running",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AI StudyBuddy API"}

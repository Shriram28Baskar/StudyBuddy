import asyncio
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from contextlib import asynccontextmanager

from routes import (
    chat, documents, progress,
    study_plans, pyqs,
    photo_solver, score_predictor, burnout_detector,
    quiz_battle, voice_solver, gap_analysis, study_rooms,
    users, friends, clans, notifications,
)
from services.vectorstore import init_vectorstore
from middleware.auth import verify_firebase_token

UPLOAD_DIR  = os.path.abspath(os.getenv("UPLOAD_DIR", "./uploads"))
IMAGES_DIR  = os.path.join(UPLOAD_DIR, "images")

# Create directories eagerly so StaticFiles mount succeeds before lifespan runs
os.makedirs(IMAGES_DIR, exist_ok=True)

# Shared auth dependency — applied at the router level so every HTTP endpoint
# in a registered router is protected without repetitive per-handler decoration.
_auth = [Depends(verify_firebase_token)]


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
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    # Start background cleanup tasks for rooms to prevent memory leaks
    cleanup_tasks = [
        asyncio.create_task(quiz_battle.cleanup_rooms()),
        asyncio.create_task(study_rooms.cleanup_rooms()),
    ]
    yield
    for t in cleanup_tasks:
        t.cancel()



app = FastAPI(title="AI StudyBuddy API", version="1.0.0", lifespan=lifespan)

_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/doc-images", StaticFiles(directory=IMAGES_DIR, html=False), name="doc-images")

# ── Core AI routes (protected) ────────────────────────────────────────────────
app.include_router(chat.router,            prefix="/chat",                tags=["Chat"],             dependencies=_auth)
app.include_router(documents.router,       prefix="/documents",           tags=["Documents"],        dependencies=_auth)
app.include_router(progress.router,        prefix="/progress",            tags=["Progress"],         dependencies=_auth)
# Unified study plan system — generation, CRUD, analytics, and adaptive planning
app.include_router(study_plans.router,     prefix="/generate-study-plan", tags=["Study Plans"],      dependencies=_auth)
app.include_router(pyqs.router,            prefix="/pyqs",                tags=["PYQs Analyzer"],    dependencies=_auth)
app.include_router(photo_solver.router,    prefix="/photo-solver",        tags=["Photo Solver"],     dependencies=_auth)
app.include_router(voice_solver.router,    prefix="/voice-solver",        tags=["Voice Solver"],     dependencies=_auth)
app.include_router(score_predictor.router, prefix="/score-predictor",     tags=["Score Predictor"],  dependencies=_auth)
app.include_router(burnout_detector.router,prefix="/burnout",             tags=["Burnout Detector"], dependencies=_auth)
app.include_router(gap_analysis.router,    prefix="/gap-analysis",        tags=["Gap Analysis"],     dependencies=_auth)

# ── Real-time routes (WebSocket + HTTP, auth handled per-endpoint) ────────────
# Router-level Depends() cannot intercept WebSocket handshakes because the
# browser WebSocket API does not support custom Authorization headers.
# These routers authenticate their HTTP endpoints via individual Depends()
# decorators and use verify_ws_token() inside WebSocket handlers.
app.include_router(quiz_battle.router,     prefix="/quiz-battle",         tags=["Quiz Battle"])
app.include_router(study_rooms.router,     prefix="/study-rooms",         tags=["Study Rooms"])

# ── Social / community routes ─────────────────────────────────────────────────
app.include_router(users.router,           prefix="/users",               tags=["Users"],            dependencies=_auth)
app.include_router(friends.router,         prefix="/friends",             tags=["Friends"],          dependencies=_auth)
app.include_router(clans.router,           prefix="/clans",               tags=["Clans"],            dependencies=_auth)
app.include_router(notifications.router,   prefix="/notifications",       tags=["Notifications"],    dependencies=_auth)


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

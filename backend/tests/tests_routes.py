"""
Run with:
    cd backend
    pip install httpx pytest pytest-asyncio
    pytest tests/test_routes.py -v
"""
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

# Set environment before importing app so Firebase & Groq don't auto-init
import os
os.environ.setdefault("ENVIRONMENT",       "development")
os.environ.setdefault("GROQ_API_KEY",      "test-key")
os.environ.setdefault("SERPAPI_API_KEY",   "test-key")
os.environ.setdefault("CHROMA_PERSIST_DIR","./test_chroma_db")
os.environ.setdefault("UPLOAD_DIR",        "./test_uploads")

from main import app

client = TestClient(app)


# ── Health ────────────────────────────────────────────────────────────

def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


# ── Chat ──────────────────────────────────────────────────────────────

@patch("routes.chat.complete", new_callable=AsyncMock)
def test_chat_basic(mock_complete):
    mock_complete.return_value = "Here is your answer."
    res = client.post("/chat", json={
        "question": "What is Newton's second law?",
        "subject":  "Physics",
        "topic":    "Laws of motion",
        "level":    "beginner",
    })
    assert res.status_code == 200
    data = res.json()
    assert "answer"  in data
    assert data["subject"] == "Physics"
    mock_complete.assert_called_once()


@patch("routes.chat.complete", new_callable=AsyncMock)
def test_chat_missing_question(mock_complete):
    res = client.post("/chat", json={"subject": "Math"})
    assert res.status_code == 422   # Pydantic validation error


@patch("routes.chat.complete_with_history", new_callable=AsyncMock)
def test_chat_with_history(mock_complete):
    mock_complete.return_value = "Follow-up answer."
    res = client.post("/chat/history", json={
        "user_id":  "user123",
        "subject":  "Math",
        "topic":    "Calculus",
        "level":    "intermediate",
        "messages": [
            {"role": "user",      "content": "What is a derivative?"},
            {"role": "assistant", "content": "A derivative measures rate of change."},
            {"role": "user",      "content": "Can you give an example?"},
        ],
    })
    assert res.status_code == 200
    assert "answer" in res.json()


# ── Documents ─────────────────────────────────────────────────────────

def test_upload_invalid_extension():
    from io import BytesIO
    res = client.post(
        "/documents/upload",
        files={"file": ("test.exe", BytesIO(b"binary content"), "application/octet-stream")},
    )
    assert res.status_code == 400
    assert "Unsupported file type" in res.json()["detail"]


@patch("routes.documents.ingest_document", new_callable=AsyncMock)
def test_upload_txt(mock_ingest):
    from io import BytesIO
    mock_ingest.return_value = {
        "doc_id":      "abc123",
        "filename":    "notes.txt",
        "chunk_count": 12,
        "filepath":    "/tmp/abc123.txt",
    }
    res = client.post(
        "/documents/upload",
        files={"file": ("notes.txt", BytesIO(b"Some study notes content here."), "text/plain")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["doc_id"]      == "abc123"
    assert data["chunk_count"] == 12


@patch("routes.documents.collection_exists", return_value=True)
@patch("routes.documents.query_document",    new_callable=AsyncMock)
@patch("routes.documents.complete",          new_callable=AsyncMock)
def test_query_document(mock_complete, mock_query, mock_exists):
    mock_query.return_value   = ["Chunk 1 relevant text.", "Chunk 2 relevant text."]
    mock_complete.return_value = "Based on the document, the answer is X."
    res = client.post("/documents/query", json={
        "question":   "What is the main topic?",
        "collection": "abc123",
        "top_k":      3,
    })
    assert res.status_code == 200
    assert "answer"  in res.json()
    assert "sources" in res.json()


@patch("routes.documents.collection_exists", return_value=False)
def test_query_nonexistent_collection(mock_exists):
    res = client.post("/documents/query", json={
        "question":   "Any question",
        "collection": "nonexistent-id",
    })
    assert res.status_code == 404


# ── Study Plan ────────────────────────────────────────────────────────

@patch("routes.studyplan.complete", new_callable=AsyncMock)
def test_generate_study_plan(mock_complete):
    from datetime import date, timedelta
    exam_date = (date.today() + timedelta(days=30)).isoformat()

    mock_complete.return_value = json.dumps({
        "plan": [
            {
                "day":  "Day 1",
                "date": "Mon",
                "tasks": [
                    {"subject": "Math",    "topic": "Algebra", "hours": 2},
                    {"subject": "Physics", "topic": "Kinematics", "hours": 2},
                ]
            }
        ],
        "summary": "Balanced plan focusing on weak areas first."
    })

    res = client.post("/studyplan", json={
        "exam":          "JEE Mains",
        "subjects":      ["Math", "Physics"],
        "exam_date":     exam_date,
        "hours_per_day": 4,
    })
    assert res.status_code == 200
    data = res.json()
    assert "plan"    in data
    assert "summary" in data
    assert len(data["plan"]) >= 1


def test_study_plan_past_date():
    res = client.post("/studyplan", json={
        "exam":          "Old Exam",
        "subjects":      ["Math"],
        "exam_date":     "2020-01-01",
        "hours_per_day": 4,
    })
    assert res.status_code == 400


# ── Mind Map ──────────────────────────────────────────────────────────

@patch("routes.mindmap.complete", new_callable=AsyncMock)
def test_generate_mindmap(mock_complete):
    mock_complete.return_value = json.dumps({
        "topic": "Machine Learning",
        "nodes": [
            {"name": "Supervised Learning", "children": ["Regression", "Classification"]},
            {"name": "Unsupervised Learning", "children": ["Clustering", "PCA"]},
        ]
    })
    res = client.post("/mindmap", json={"topic": "Machine Learning"})
    assert res.status_code == 200
    data = res.json()
    assert data["topic"] == "Machine Learning"
    assert len(data["nodes"]) == 2


# ── Roadmap ───────────────────────────────────────────────────────────

@patch("routes.roadmap.search_roadmap_data", return_value="No search data.")
@patch("routes.roadmap.complete", new_callable=AsyncMock)
def test_generate_roadmap(mock_complete, mock_serp):
    mock_complete.return_value = json.dumps({
        "goal": "Become an ML Engineer",
        "phases": [
            {
                "phase":     "Phase 1",
                "title":     "Foundations",
                "duration":  "4 weeks",
                "skills":    ["Python", "NumPy"],
                "resources": ["fast.ai", "Coursera ML"],
            }
        ]
    })
    res = client.post("/roadmap", json={"goal": "Become an ML Engineer"})
    assert res.status_code == 200
    data = res.json()
    assert "phases" in data
    assert data["phases"][0]["title"] == "Foundations"


# ── Career ────────────────────────────────────────────────────────────

@patch("routes.career.search_career_data", return_value="No search data.")
@patch("routes.career.complete", new_callable=AsyncMock)
def test_career_guidance(mock_complete, mock_serp):
    mock_complete.return_value = json.dumps({
        "roles": [
            {
                "title":    "ML Engineer",
                "salary":   "$90,000 - $140,000",
                "match":    92,
                "skills":   ["Python", "TensorFlow"],
                "nextStep": "Build an end-to-end ML project.",
            },
            {
                "title":    "Data Scientist",
                "salary":   "$80,000 - $120,000",
                "match":    78,
                "skills":   ["Python", "Statistics"],
                "nextStep": "Take a Kaggle competition.",
            },
        ]
    })
    res = client.post("/career", json={
        "skills":    ["Python", "Machine Learning", "SQL"],
        "interests": ["AI", "startups"],
    })
    assert res.status_code == 200
    roles = res.json()["roles"]
    assert len(roles) == 2
    assert roles[0]["match"] >= roles[1]["match"]   # sorted by match


# ── Progress ──────────────────────────────────────────────────────────

@patch("routes.progress.firebase")
def test_log_score(mock_firebase):
    mock_firebase.get_progress.return_value = [{"score": 70}]
    mock_firebase.save_progress_entry.return_value = "entry123"

    res = client.post("/progress", json={
        "user_id":   "user123",
        "subject":   "Mathematics",
        "score":     85.0,
        "test_name": "Mock Test 1",
    })
    assert res.status_code == 200
    data = res.json()
    assert data["entry_id"] == "entry123"
    assert data["trend"]    == 15.0   # 85 - 70


@patch("routes.progress.firebase")
def test_get_progress(mock_firebase):
    mock_firebase.get_progress.return_value = [
        {"subject": "Math", "score": 70, "timestamp": "2024-01-01T00:00:00"},
        {"subject": "Math", "score": 85, "timestamp": "2024-01-08T00:00:00"},
    ]
    res = client.get("/progress/user123")
    assert res.status_code == 200
    data = res.json()
    assert "entries"       in data
    assert "subject_stats" in data
    assert data["total_tests"] == 2
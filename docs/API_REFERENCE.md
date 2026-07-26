# API Reference

StudyBuddy provides a RESTful API powered by FastAPI.

## Base URL
All API requests in the local environment should be routed to:
```
http://localhost:8000
```
*(In the Docker Compose environment, the frontend `nginx` proxy automatically routes `/api` calls to the backend container).*

## Authentication

StudyBuddy uses **Firebase Authentication**. Every protected route requires a valid Firebase ID Token passed in the `Authorization` header.

**Header Format:**
```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

> **Development Mode:** If the backend `.env` has `ENVIRONMENT=development`, the middleware will accept any request without a valid token and automatically mock a user payload (`{uid: 'dev-user-001'}`). This ensures rapid local development without requiring Firebase credentials.

---

## Key Endpoints

### 1. Document Management & RAG

Upload PDFs and interact with them semantically.

#### `POST /documents/upload`
Uploads a document, extracts text, generates embeddings, and stores them in ChromaDB.
- **Content-Type:** `multipart/form-data`
- **Body:** `file` (PDF)
- **Response:**
  ```json
  {
    "doc_id": "uuid-string",
    "filename": "lecture_notes.pdf",
    "chunks": 42
  }
  ```

#### `POST /chat/document`
Query a specific uploaded document.
- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "doc_id": "uuid-string",
    "message": "What are the three main causes of the French Revolution?"
  }
  ```

---

### 2. Adaptive Study Plans

Generate, track, and adapt multi-week study schedules.

#### `POST /generate-study-plan`
Creates a new study plan from scratch using the LLM engine.
- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "topic": "Organic Chemistry",
    "duration_weeks": 4
  }
  ```

#### `PATCH /generate-study-plan/{plan_id}/progress`
Updates task completion and records weekly MCQ test scores.
- **Content-Type:** `application/json`
- **Body:**
  ```json
  {
    "plan_id": "uuid-string",
    "completed_tasks": {"w0_Monday_0": true},
    "test_scores": [{"week": 1, "score": 8, "total": 10}],
    "completion_percentage": 15.5
  }
  ```

#### `POST /generate-study-plan/{plan_id}/adapt`
Triggers the analytical engine to evaluate progress and dynamically regenerate a weak week based on test scores.
- **Response:**
  ```json
  {
    "adapted": true,
    "message": "We've added extra practice for: Reaction Mechanisms.",
    "adapted_week": { ... }
  }
  ```

---

### 3. Gap Analysis & PYQs

#### `POST /gap-analysis/analyze`
Compares a syllabus (text) against a user's uploaded lecture notes (PDF) to find missing concepts.
- **Content-Type:** `multipart/form-data`
- **Body:** `syllabus` (text string), `file` (PDF)

#### `POST /pyqs/analyze`
Extracts Previous Year Questions from a PDF and provides step-by-step solutions.
- **Content-Type:** `multipart/form-data`
- **Body:** `file` (PDF)

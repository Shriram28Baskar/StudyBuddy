<div align="center">

# StudyBuddy

### AI-Powered Personal Learning Brain

[![Build & Test](https://github.com/Shriram28Baskar/StudyBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/Shriram28Baskar/StudyBuddy/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=FastAPI&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_18-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)

**StudyBuddy** transforms the way students learn by combining Retrieval-Augmented Generation (RAG), adaptive AI planning, real-time collaboration, and intelligent performance analytics into one cohesive platform.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Feature Showcase](#feature-showcase)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Quick Start](#quick-start)
- [Environment Configuration](#environment-configuration)
- [Running Tests](#running-tests)
- [Engineering Highlights](#engineering-highlights)
- [Documentation](#documentation)
- [License](#license)

---

## Overview

**The Problem:** Traditional studying is passive and disconnected. Students read textbooks without assessment, struggle to identify weak areas, and have no intelligent system to guide their learning path over time.

**The Solution:** StudyBuddy is a full-stack, AI-powered learning platform that:

- **Adapts** to your performance — weak topics are reinforced in subsequent study weeks automatically.
- **Understands** your documents — upload any PDF, Word, or PowerPoint file and chat with it semantically.
- **Predicts** your exam scores using AI analysis of your past performance and confidence levels.
- **Detects** burnout signals and surfaces personalized recommendations before you hit a wall.
- **Connects** you with peers in real-time collaborative study rooms and quiz battles.

This project was architected to demonstrate **senior-level software engineering** — not just feature delivery. Every decision prioritizes reliability, security, and long-term maintainability.

---

## Feature Showcase

### AI-Powered Core

| Feature | Description |
|---|---|
| **Adaptive Study Plans** | Generates multi-week, topic-based study outlines. After each weekly MCQ test, the AI analyzes performance and dynamically regenerates future weeks, reinforcing weak topics. |
| **RAG Document Chat** | Upload PDFs, DOCX, PPTX, or Excel files. The backend chunks, embeds, and indexes them via ChromaDB. Ask any question and get grounded, citation-backed answers. |
| **Gap Analysis** | Semantically compare your uploaded study materials against a syllabus or set of previous year questions (PYQs) to surface exactly what you haven't covered. |
| **PYQs Analyzer** | Paste previous exam questions; get AI-generated topic mapping, difficulty analysis, and targeted preparation advice. |
| **Score Predictor** | Input your performance metrics and confidence ratings across topics. The AI returns a predicted score range with subject-level breakdowns and key recommendations. |
| **Burnout Detector** | A multi-factor questionnaire-based analysis. The AI evaluates your responses and returns a personalized burnout risk level with actionable recommendations. |

### AI Solvers

| Feature | Description |
|---|---|
| **Photo Solver** | Take a photo of any handwritten or printed problem. The image is classified and analyzed by an AI vision pipeline to produce a step-by-step solution. |
| **Voice Solver** | Ask academic questions via voice. The system uses speech recognition, processes the query through the AI tutor, and responds with text-to-speech synthesis. |
| **Universal AI Tutor (Chat)** | A context-aware chat interface backed by Groq's LLM inference. Supports math rendering via KaTeX and Markdown for rich responses. |

### Social & Collaboration

| Feature | Description |
|---|---|
| **Study Rooms** | Create or join real-time collaborative study rooms via WebSockets. Share text, ask questions, and study together with live presence indicators. |
| **Quiz Battle** | Challenge peers to real-time, 1v1 AI-generated MCQ battles over WebSocket. Rooms are auto-created, and scoring is tracked live. |
| **Clans** | Form and manage study groups ("Clans"). Includes a shared clan chat and leaderboard. |
| **Friends & Notifications** | Add friends, manage friend requests, and receive real-time system notifications. |
| **Community** | A community feed and discovery page for finding study partners. |

### Analytics & Progress

| Feature | Description |
|---|---|
| **Progress Dashboard** | Recharts-powered visualizations of study velocity, task completion rates, and weekly score trends across all study plans. |
| **Study Plan History** | Full archive of all generated plans with per-week status, task completion, and adaptation logs. |
| **Document Library** | Manage all uploaded documents. View extracted metadata, page counts, and re-initiate chat with any document. |

---

## Technology Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React 18** (Vite) | Core SPA framework with fast HMR during development |
| **TailwindCSS** | Utility-first styling system |
| **Framer Motion** | Page transitions and micro-animations |
| **Zustand** | Lightweight global state management |
| **React Router v6** | Client-side routing |
| **Recharts** | Data visualization for analytics dashboards |
| **KaTeX / react-katex** | LaTeX mathematical expression rendering |
| **react-markdown + remark-gfm** | Rich Markdown rendering in chat and analysis outputs |
| **react-pdf + pdfjs-dist** | In-browser PDF preview |
| **Firebase SDK** | Client-side authentication (Google Sign-In) |
| **Axios** | HTTP client for all API requests |
| **Vitest + Testing Library** | Automated unit and component testing |

### Backend

| Technology | Purpose |
|---|---|
| **FastAPI** | Async Python web framework with automatic OpenAPI docs |
| **Uvicorn** | High-performance ASGI server |
| **Groq API** (`llama-3.1-8b-instant`) | High-speed LLM inference for all AI features |
| **ChromaDB** | Persistent local vector store for RAG document embeddings |
| **sentence-transformers** (`all-MiniLM-L6-v2`) | Local embedding model for semantic search |
| **pypdf / PyMuPDF / python-docx / python-pptx** | Multi-format document parsing pipeline |
| **Pydantic v2** | Request/response schema validation |
| **Tenacity** | Retry logic with exponential backoff for LLM calls |
| **Pytest** | Backend integration testing |

### Infrastructure

| Technology | Purpose |
|---|---|
| **Firebase Auth + Firestore** | Authentication (JWT verification) and persistent user data |
| **Docker & Docker Compose** | Container orchestration for the full stack |
| **Nginx** | Reverse proxy and static file serving for the frontend container |
| **GitHub Actions** | CI/CD: automated Pytest + Vite production build on every push |

---

## Architecture

StudyBuddy uses a clean, decoupled architecture with strict separation between layers.

```
┌──────────────────────────────────────────────────────┐
│                    Client Browser                    │
│               React SPA (Vite Build)                 │
└───────────────────────┬──────────────────────────────┘
                         │ HTTP / WebSocket
                         ▼
┌──────────────────────────────────────────────────────┐
│                 Nginx Reverse Proxy                  │
│  • Serves static Vite build                          │
│  • Proxies /api/* → FastAPI backend                  │
└───────────────────────┬──────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│              FastAPI Backend (Python)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐   │
│  │  Middleware │  │   Routers    │  │  Services  │   │
│  │ Firebase JWT│  │ (HTTP + WS)  │  │ (Business  │   │
│  │ Validation  │  │ 18 endpoints │  │  Logic)    │   │
│  └─────────────┘  └──────────────┘  └────────────┘   │
└──────┬──────────────────────────────────┬─────────────┘
       │                                  │
       ▼                                  ▼
┌──────────────┐                 ┌────────────────────┐
│ Firebase     │                 │ Groq API           │
│ • Auth JWT   │                 │ (LLM Inference)    │
│ • Firestore  │                 └────────────────────┘
│   (User data)│                          │
└──────────────┘                          ▼
                                 ┌────────────────────┐
                                 │ ChromaDB           │
                                 │ (Vector Store)     │
                                 │ sentence-          │
                                 │ transformers       │
                                 └────────────────────┘
```

For detailed Mermaid diagrams covering the RAG pipeline and adaptive study plan engine, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

### Backend Layer Structure

```
routes/        → Thin HTTP controllers. Parse schemas, call services, return responses.
services/      → Core business intelligence. LLM orchestration, RAG, embeddings, analytics.
models/        → Pydantic v2 schemas for input validation and output serialization.
middleware/    → Request interceptors (Firebase JWT verification applied globally).
utils/         → Shared helper utilities.
```

---

## Repository Structure

```
StudyBuddy/
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions CI/CD pipeline
├── backend/
│   ├── main.py                       # FastAPI app factory & router registration
│   ├── requirements.txt              # Python dependencies
│   ├── Dockerfile                    # Lean Python container
│   ├── .env.example                  # Environment variable template
│   ├── middleware/
│   │   └── auth.py                   # Firebase JWT verification middleware
│   ├── models/
│   │   └── document.py               # Pydantic request/response schemas
│   ├── routes/                       # 18 feature routers (HTTP + WebSocket)
│   │   ├── chat.py
│   │   ├── documents.py
│   │   ├── study_plans.py
│   │   ├── gap_analysis.py
│   │   ├── pyqs.py
│   │   ├── score_predictor.py
│   │   ├── burnout_detector.py
│   │   ├── photo_solver.py
│   │   ├── voice_solver.py
│   │   ├── quiz_battle.py            # Real-time WebSocket quiz battles
│   │   ├── study_rooms.py            # Real-time WebSocket study rooms
│   │   ├── clans.py
│   │   ├── friends.py
│   │   ├── notifications.py
│   │   ├── users.py
│   │   └── progress.py
│   ├── services/                     # Core AI & business logic
│   │   ├── llm.py                    # Groq LLM client with retry logic
│   │   ├── rag.py                    # RAG pipeline (chunking, embedding, retrieval)
│   │   ├── vectorstore.py            # ChromaDB initialization and management
│   │   ├── firebase.py               # Firestore CRUD operations
│   │   ├── study_plan_engine.py      # Adaptive plan generation & performance analysis
│   │   ├── confidence_manager.py     # Score prediction confidence scoring
│   │   ├── query_classifier.py       # Classifies chat queries (RAG vs. general)
│   │   ├── image_classifier.py       # Photo solver image pre-processing
│   │   ├── embeddings.py             # Embedding model singleton
│   │   ├── serp.py                   # Web search integration
│   │   ├── rag_images.py             # Image extraction from documents
│   │   └── prompts/                  # Isolated LLM prompt templates
│   ├── tests/
│   │   └── test_routes.py            # Pytest integration tests
│   └── utils/                        # Shared backend utilities
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── Dockerfile                    # Multi-stage Nginx build
│   ├── nginx.conf                    # Nginx reverse proxy config
│   └── src/
│       ├── App.jsx                   # Root component & route definitions
│       ├── main.jsx                  # React entry point
│       ├── pages/                    # 19 full-page feature components
│       │   ├── Login.jsx
│       │   ├── Dashboard.jsx
│       │   ├── Chat.jsx
│       │   ├── Documents.jsx
│       │   ├── StudyPlanAI.jsx
│       │   ├── StudyPlanHistory.jsx
│       │   ├── GapAnalysis.jsx
│       │   ├── PYQsAnalyzer.jsx
│       │   ├── ScorePredictor.jsx
│       │   ├── BurnoutDetector.jsx
│       │   ├── PhotoSolver.jsx
│       │   ├── VoiceSolver.jsx
│       │   ├── QuizBattle.jsx
│       │   ├── StudyRooms.jsx
│       │   ├── StudyRoom.jsx
│       │   ├── ProgressDashboard.jsx
│       │   ├── Community.jsx
│       │   ├── ClanDashboard.jsx
│       │   └── StudyPlanDetail.jsx
│       ├── components/               # Reusable UI building blocks
│       │   ├── layout/               # Sidebar, TopBar, navigation
│       │   ├── chat/                 # Chat-specific components
│       │   ├── community/            # Social feature components
│       │   ├── room/                 # Study room components
│       │   ├── ui/                   # Generic UI primitives
│       │   ├── MathMarkdown.jsx      # KaTeX + Markdown renderer
│       │   ├── VisualEvidenceCard.jsx
│       │   └── ErrorBoundary.jsx
│       ├── hooks/                    # Custom React hooks
│       │   ├── useQuizBattle.js      # WebSocket quiz battle state machine
│       │   ├── useStudyRoom.js       # WebSocket study room state machine
│       │   ├── useClanChat.js
│       │   ├── useNotifications.js
│       │   ├── useSpeechRecognition.js
│       │   ├── useTextToSpeech.js
│       │   └── useVoiceChat.js
│       ├── services/
│       │   ├── api.js                # Axios client with Firebase auth injection
│       │   └── firestore.js          # Firestore client-side operations
│       └── store/
│           └── useAppStore.js        # Zustand global state store
├── docs/
│   ├── ARCHITECTURE.md               # System design and Mermaid diagrams
│   ├── API_REFERENCE.md              # Endpoint documentation
│   ├── DEVELOPMENT.md                # Local setup and coding conventions
│   ├── DEPLOYMENT.md                 # Docker and production deployment guide
│   ├── CONTRIBUTING.md               # Branching, testing, and PR guidelines
│   └── RELEASE_NOTES.md              # Version history and changelog
├── docker-compose.yml                # Full-stack container orchestration
├── .gitignore
└── DOCKER_SETUP.md                   # Supplementary Docker setup guide
```

---

## Quick Start

The fastest way to run StudyBuddy is via **Docker Compose**.

### Prerequisites

- [Docker Engine](https://docs.docker.com/get-docker/) & Docker Compose v2
- A **Groq API Key** — free at [console.groq.com](https://console.groq.com)
- A **Firebase Project** with Firestore enabled and a Service Account Key downloaded

### 1. Clone the Repository

```bash
git clone https://github.com/Shriram28Baskar/StudyBuddy.git
cd StudyBuddy
```

### 2. Configure Environment Variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your credentials:

```env
GROQ_API_KEY=your_groq_api_key_here
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
# ... see backend/.env.example for all required variables
```

Place your Firebase `serviceAccountKey.json` inside the `backend/` directory.

### 3. Launch the Stack

```bash
docker compose up -d --build
```

### 4. Access the Application

| Service | URL |
|---|---|
| **Application** | http://localhost:5173 |
| **API (Swagger Docs)** | http://localhost:8000/docs |
| **API Health Check** | http://localhost:8000/health |

> For local development without Docker, see **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

---

## Environment Configuration

All secrets are managed server-side. The frontend has **zero client-side API keys**.

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Yes | Path to your Firebase service account JSON |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of allowed CORS origins |
| `SERPAPI_KEY` | Optional | SerpAPI key for web search augmentation |
| `UPLOAD_DIR` | Optional | Override for file upload directory (default: `./uploads`) |

See `backend/.env.example` for the complete template.

### Frontend (`frontend/.env.local`)

The frontend only requires Firebase client-side configuration (public, non-secret keys for the Firebase client SDK):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# ... see frontend/.env.local.example for all required variables
```

---

## Running Tests

### Backend (Pytest)

```bash
cd backend
python -m pytest tests/ -v
```

### Frontend (Vitest)

```bash
cd frontend
npm run test
```

Both test suites are automatically executed on every push to `main` via GitHub Actions. See **[.github/workflows/ci.yml](.github/workflows/ci.yml)**.

---

## Engineering Highlights

This project is designed to demonstrate **production-grade software engineering** beyond typical portfolio work.

### Security

- **Zero Client-Side Secrets:** All LLM API keys reside exclusively on the backend. The frontend holds only Firebase public SDK config.
- **Global Auth Enforcement:** `verify_firebase_token` middleware is applied at the router level — not per-endpoint — making it impossible to accidentally miss an unprotected route.
- **WebSocket Authentication:** Real-time WebSocket handlers use a dedicated `verify_ws_token()` helper since the browser WebSocket API cannot send custom `Authorization` headers.

### Architecture & Code Quality

- **Strict Separation of Concerns:** HTTP routers are deliberately kept thin — they parse inputs and return responses. All AI orchestration, analytics, and data logic lives in the `services/` layer.
- **Production RAG Pipeline:** Implements chunked text extraction, persistent vector storage (ChromaDB), and semantic retrieval with multi-format document support (PDF, DOCX, PPTX, XLSX).
- **Adaptive AI Engine:** The `study_plan_engine.py` service is decoupled from HTTP concerns — it can be tested and extended in isolation.
- **Retry Resilience:** All external API calls (Groq, SerpAPI) use `tenacity` with exponential backoff.
- **Background Cleanup:** Long-lived WebSocket room cleanup tasks run as async background coroutines and are properly cancelled on application shutdown.

### CI/CD & Testing

- **GitHub Actions Pipeline:** Every push to `main` triggers automated Python tests and a Vite production build validation.
- **Automated Frontend Tests:** Vitest + React Testing Library validates Zustand store behavior.
- **Pytest Integration Tests:** Backend route contracts are validated via integration tests.

### Developer Experience

- **One-Command Setup:** `docker compose up -d --build` spins up the entire stack.
- **Auto-Generated API Docs:** FastAPI produces interactive Swagger UI at `/docs`.
- **Type-Safe Schemas:** Pydantic v2 enforces input and output contracts on all endpoints.

---

## Documentation

| Document | Description |
|---|---|
| [Architecture Overview](docs/ARCHITECTURE.md) | System design, Mermaid diagrams, RAG pipeline, and adaptive engine flow |
| [API Reference](docs/API_REFERENCE.md) | Authentication details and endpoint usage guide |
| [Development Guide](docs/DEVELOPMENT.md) | Local setup, repository structure, and coding conventions |
| [Deployment Guide](docs/DEPLOYMENT.md) | Docker Compose details and production deployment steps |
| [Contributing](docs/CONTRIBUTING.md) | Branching strategy, testing requirements, and PR guidelines |
| [Release Notes](docs/RELEASE_NOTES.md) | Version history and changelog |

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

<div align="center">

Built as a flagship portfolio project demonstrating senior-level full-stack AI engineering.

</div>

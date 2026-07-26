# Development Guide

Welcome to the StudyBuddy engineering team! This guide explains how to navigate the repository, run tests, and adhere to our coding standards.

## 📁 Repository Structure

```text
StudyBuddy/
├── backend/                  # FastAPI Application
│   ├── main.py               # Application entry point
│   ├── middleware/           # Auth and interceptors
│   ├── models/               # Pydantic schemas
│   ├── routes/               # HTTP endpoints
│   ├── services/             # Business logic (LLM, RAG, Analytics)
│   ├── tests/                # Pytest integration tests
│   └── requirements.txt      # Python dependencies
├── frontend/                 # React/Vite SPA
│   ├── src/
│   │   ├── components/       # Reusable UI widgets
│   │   ├── pages/            # Routable views
│   │   ├── services/         # API clients (axios)
│   │   ├── store/            # Zustand global state
│   │   └── test/             # Vitest setup
│   ├── package.json          # Node dependencies
│   └── vite.config.js        # Build configuration
├── docs/                     # Technical documentation
├── docker-compose.yml        # Multi-container orchestration
└── README.md
```

## 🛠️ Local Development (Without Docker)

While Docker is recommended for production testing, running the servers natively provides the fastest feedback loop for active development.

### 1. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 2. Backend Setup
We highly recommend using a virtual environment.
```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.0 --port 8000
```

> **Note:** The backend requires a `GROQ_API_KEY` in `backend/.env`.

## 🧪 Testing Strategy

Automated tests are required for all new features.

### Frontend (Vitest)
The frontend uses Vitest for rapid unit testing, particularly focusing on the `Zustand` global state and utility functions.
```bash
cd frontend
npm run test
```

### Backend (Pytest)
The backend uses Pytest. Our tests are located in `backend/tests/` and spin up an asynchronous test client to hit live endpoints.
```bash
cd backend
python -m pytest
```
*If you experience `WinError 126` regarding `torch` DLLs on Windows, ensure your `venv` is active before running Pytest.*

## 📐 Coding Conventions

1. **Decouple Business Logic:** Never place complex analytics, LLM prompt generation, or data normalization inside a route file (`routes/`). Extract these into the `services/` directory. Route files must only handle HTTP parsing, Auth, and DB orchestration.
2. **Secrets:** Never commit secrets. Ensure the frontend never imports `VITE_GROQ_API_KEY`. All LLM calls must securely route through the backend.
3. **Typing:** Use Python type hints and Pydantic models extensively to document parameters.

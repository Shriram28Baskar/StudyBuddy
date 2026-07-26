# Deployment Guide

This guide explains how to deploy StudyBuddy using our production-ready Docker Compose environment.

## The Docker Architecture

StudyBuddy uses a decoupled, multi-container orchestration strategy:
1. **Frontend Container (`nginx:alpine`)**: We use a multi-stage Dockerfile. It first builds the React/Vite SPA using Node, then copies the optimized `dist` assets into an Nginx web server. Nginx natively handles routing fallback to `index.html` and reverse-proxies `/api` traffic to the backend container.
2. **Backend Container (`python:3.11-slim`)**: A lightweight container hosting the FastAPI server. We explicitly omit heavy OS dependencies (like `ffmpeg` or `texlive`) to keep the primary image lean, fast, and optimized for the core RAG and LLM features.
3. **Volumes**: Persistent Docker volumes are mounted for `chroma_db` (preventing vector re-ingestion on restart) and local file uploads.

## Setup Instructions

### 1. Install Docker
Ensure you have Docker and Docker Compose installed. [Docker Desktop](https://www.docker.com/products/docker-desktop/) is the easiest solution for Windows and Mac.

### 2. Configure Environment Variables
You need to provide the LLM API keys for the backend to function.

```bash
cd backend
cp .env.example .env
```
Open `backend/.env` and insert your API keys:
```ini
ENVIRONMENT=development
GROQ_API_KEY=gsk_your_actual_key_here
```
*(Setting `ENVIRONMENT=development` bypasses strict Firebase Auth token validation, allowing you to bypass setting up a Google Cloud project while still accessing the APIs).*

### 3. Launch the Stack
Return to the root directory (where `docker-compose.yml` is located) and run:

```bash
docker compose up -d --build
```
The `--build` flag ensures Docker compiles the latest frontend assets and installs any new Python requirements.

### 4. Verify Services
- **Frontend App:** Navigate to `http://localhost:5173`
- **Backend API:** Navigate to `http://localhost:8000/docs`

## Continuous Integration (CI/CD)

The repository uses GitHub Actions (`.github/workflows/ci.yml`) to enforce code quality.
Every Pull Request and Push to `main` triggers:
- `backend-tests`: Provisions an Ubuntu runner, sets up Python 3.11, and runs `python -m pytest --junitxml=pytest.xml`.
- `frontend-build`: Provisions Node 20, runs `npm ci`, and executes `npm run build` to ensure the production bundle compiles flawlessly.

Build artifacts (like the `dist/` folder and `pytest.xml` reports) are automatically uploaded to the GitHub Actions tab for review.

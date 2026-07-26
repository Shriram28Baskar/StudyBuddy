# StudyBuddy Docker Setup Guide

This guide allows anyone to clone the repository and launch the full StudyBuddy application (frontend + backend) in a reliable, isolated Docker container environment with a single command.

## Prerequisites

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows) or Docker Engine (Linux).
2. Ensure Docker is running.

## 1. Environment Configuration

You must provide two `.env` files for the application to run successfully. The system requires an LLM key (Groq) and a Firebase Service Account key for authentication/database persistence.

### Backend (`backend/.env`)
Copy the provided `.env.example` file in the `backend/` directory to `.env` and fill in your keys:

```bash
cd backend
cp .env.example .env
```

Ensure your `backend/.env` file looks like this:
```ini
ENVIRONMENT=development
# Replace with your actual Groq API Key
GROQ_API_KEY=gsk_your_groq_api_key_here
```

### Firebase Service Account (`backend/serviceAccountKey.json`)
The backend needs a Firebase Admin SDK key to communicate with Firestore. 
1. Go to your Firebase Console -> Project Settings -> Service Accounts.
2. Generate a new private key.
3. Save the downloaded JSON file as `serviceAccountKey.json` directly inside the `backend/` directory.

> **Note:** If you are just testing the UI and APIs and do not want to set up Firebase, the backend authentication middleware is configured to automatically return a mock development user if `ENVIRONMENT=development` is set in the `.env` file, meaning you do not strictly need the `serviceAccountKey.json` just to spin up the local RAG tools.

---

## 2. Launch the Application

With your `.env` configured, return to the root directory of the project and run:

```bash
docker compose up -d --build
```

This will automatically:
1. Build the lightweight Python backend image, install dependencies, and start the FastAPI server.
2. Build the multi-stage React/Vite frontend image and serve the static bundle using a high-performance Nginx reverse proxy.
3. Establish a Docker network so the Nginx proxy can route `/api/*` traffic seamlessly to the backend container.

### Stopping the Application
To stop the containers:
```bash
docker compose down
```

---

## 3. Accessing the Application

Once the containers are running:

- **Frontend Application:** `http://localhost:5173` (Open this in your browser)
- **Backend API Docs (Swagger):** `http://localhost:8000/docs`

> **Architectural Note regarding Manim:** To maximize deployment speed and minimize image size, the heavy OS dependencies required for programmatic video generation (Manim) have been excluded from the core backend image. All core AI/RAG functionalities operate flawlessly, but attempting to generate a Manim video via the API will fail gracefully in this containerized environment.

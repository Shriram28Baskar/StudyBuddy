# System Architecture

StudyBuddy is built on a decoupled, async-first architecture optimized for speed, maintainability, and seamless AI integration.

## High-Level System Architecture

The following diagram illustrates the high-level infrastructure and request flow of the containerized environment.

```mermaid
graph TD
    Client[Client Browser / React SPA] -->|HTTP / React Router| Proxy[Nginx Proxy :80]
    
    subgraph Frontend Container
        Proxy -->|Serves Static Files| StaticDist[Vite Built Assets]
    end
    
    Proxy -->|Proxies /api| API[FastAPI Backend :8000]

    subgraph Backend Container
        API --> AuthMiddleware[Auth Middleware]
        AuthMiddleware -.->|Validates Token| FirebaseCloud[(Firebase Auth)]
        
        API --> Routers[HTTP Routers]
        Routers --> ServiceLayer[Service Engines]
        
        ServiceLayer -->|LLM Inference| Groq[Groq API llama-3.1]
        ServiceLayer -->|Embeddings| SentenceTransformers[all-MiniLM-L6-v2]
        
        SentenceTransformers -->|Vector Storage| ChromaDB[(ChromaDB Persistent Volume)]
        ServiceLayer -->|CRUD State| Firestore[(Firebase Firestore)]
    end
```

## Retrieval-Augmented Generation (RAG) Pipeline

When a user uploads a document (e.g., a PDF lecture), the backend processes it into semantic chunks for real-time querying.

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant API as FastAPI (routes/documents.py)
    participant RAG as RAG Service
    participant Embed as Embedding Model
    participant DB as ChromaDB
    
    User->>Frontend: Upload PDF Document
    Frontend->>API: POST /documents/upload (multipart/form-data)
    API->>RAG: ingest_document(file)
    
    rect rgb(30, 40, 50)
        Note right of RAG: Processing Pipeline
        RAG->>RAG: Extract Text via pypdf
        RAG->>RAG: Chunk Text (400 words, 50 overlap)
    end
    
    RAG->>Embed: embed_texts(chunks)
    Embed-->>RAG: Vector Embeddings
    
    RAG->>DB: Upsert Vectors (Collection = doc_id)
    DB-->>RAG: Success
    
    RAG-->>API: Extraction Metadata
    API-->>Frontend: 200 OK (doc_id)
```

## Adaptive Study Plan Engine

The Study Plan system operates entirely decoupled from HTTP concerns. When a user completes tasks and takes tests, the system analyzes their performance to dynamically adapt future weeks.

```mermaid
sequenceDiagram
    participant Route as routes/study_plans.py
    participant Engine as services/study_plan_engine.py
    participant DB as Firestore
    participant LLM as Groq LLM

    Route->>Engine: analyze_performance(plan_data)
    Engine-->>Route: {weak_topics, strong_topics, completion_pct}
    
    alt Completion > Threshold
        Route->>DB: update_progress()
    else Adapting Week
        Route->>Engine: generate_week_content(topic, week_num, focus=weak_topics[0])
        Engine->>LLM: complete(WEEK_PROMPT)
        LLM-->>Engine: Raw JSON String
        Engine->>Engine: normalize_week_data()
        Engine-->>Route: Clean Adapted Week Dict
        Route->>DB: Update Plan (Overwrite Week)
    end
```

## Backend Modular Structure

The backend separates concerns vertically by feature domain and horizontally by abstraction layer:

- **`main.py`**: FastAPI application factory, CORS setup, Lifespan tasks.
- **`routes/`**: Fast, clean HTTP controllers. They parse Pydantic schemas, invoke services, and return standard status codes.
- **`services/`**: The core business intelligence. Connects to LLMs, handles vector mathematics, and orchestrates data aggregation.
- **`models/`**: Pydantic schemas enforcing input validation and output serialization.
- **`middleware/`**: Request interceptors (e.g., `verify_firebase_token` for seamless auth).

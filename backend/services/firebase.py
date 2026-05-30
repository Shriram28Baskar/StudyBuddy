import os
from typing import Optional, List
import firebase_admin
from firebase_admin import credentials, firestore, storage
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

_initialized = False


def _init_firebase() -> None:
    global _initialized
    if _initialized:
        return

    service_account_path = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        "./serviceAccountKey.json"
    )

    if os.path.exists(service_account_path):
        # Load from JSON file (recommended for local dev)
        cred = credentials.Certificate(service_account_path)
    else:
        # Fallback: build from individual env vars
        private_key = os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n")
        if not private_key:
            raise RuntimeError("Firebase credentials missing. Please provide serviceAccountKey.json or set FIREBASE_PRIVATE_KEY environment variable.")
        
        cred = credentials.Certificate({
            "type":                        "service_account",
            "project_id":                  os.getenv("FIREBASE_PROJECT_ID", ""),
            "private_key_id":              os.getenv("FIREBASE_PRIVATE_KEY_ID", ""),
            "private_key":                 private_key,
            "client_email":                os.getenv("FIREBASE_CLIENT_EMAIL", ""),
            "client_id":                   os.getenv("FIREBASE_CLIENT_ID", ""),
            "auth_uri":                    "https://accounts.google.com/o/oauth2/auth",
            "token_uri":                   "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url":        "",
        })

    firebase_admin.initialize_app(
        cred,
        {"storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET", "")}
    )
    _initialized = True
    print("[firebase] Firebase Admin SDK initialized")


def get_db():
    _init_firebase()
    return firestore.client()


def get_bucket():
    _init_firebase()
    return storage.bucket()


# ── Conversation history ──────────────────────────────────────────────

def save_conversation(user_id: str, messages: list, subject: str, topic: str) -> str:
    db  = get_db()
    ref = db.collection("conversations").document()
    ref.set({
        "user_id":    user_id,
        "messages":  messages,
        "subject":   subject,
        "topic":     topic,
        "timestamp": datetime.now(timezone.utc),
    })
    return ref.id


def get_conversations(user_id: str, limit: int = 20) -> list:
    db = get_db()
    docs = (
        db.collection("conversations")
        .where("user_id", "==", user_id)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ── Study plans ───────────────────────────────────────────────────────

def save_study_plan(user_id: str, plan: dict) -> str:
    db = get_db()
    ref = db.collection("studyPlans").document()
    ref.set({**plan, "user_id": user_id, "created_at": datetime.now(timezone.utc)})
    return ref.id


# ── Community posts ───────────────────────────────────────────────────

def create_post(data: dict) -> str:
    db  = get_db()
    ref = db.collection("posts").document()
    ref.set({
        **data,
        "likes":        0,
        "commentCount": 0,
        "timestamp":    datetime.now(timezone.utc),
    })
    return ref.id


def get_posts(limit: int = 30) -> list:
    db   = get_db()
    docs = (
        db.collection("posts")
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def like_post(post_id: str) -> None:
    db  = get_db()
    ref = db.collection("posts").document(post_id)
    ref.update({"likes": firestore.Increment(1)})


def add_comment(post_id: str, comment: dict) -> str:
    db  = get_db()
    ref = db.collection("posts").document(post_id).collection("comments").document()
    ref.set({**comment, "timestamp": datetime.now(timezone.utc)})
    db.collection("posts").document(post_id).update(
        {"commentCount": firestore.Increment(1)}
    )
    return ref.id


# ── Progress tracking ─────────────────────────────────────────────────

def save_progress_entry(user_id: str, subject: str, score: float, test_name: str) -> str:
    db  = get_db()
    ref = db.collection("progress").document()
    ref.set({
        "user_id":    user_id,
        "subject":   subject,
        "score":     score,
        "testName":  test_name,
        "timestamp": datetime.now(timezone.utc),
    })
    return ref.id


def get_progress(user_id: str, subject: Optional[str] = None) -> list:
    db    = get_db()
    query = db.collection("progress").where("user_id", "==", user_id)
    if subject:
        query = query.where("subject", "==", subject)
    docs = query.order_by("timestamp").stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]
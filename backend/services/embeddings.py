import os
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

_model: SentenceTransformer | None = None
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # 384-dim, fast, free


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        print(f"[embeddings] Loading model: {EMBEDDING_MODEL}")
        _model = SentenceTransformer(EMBEDDING_MODEL)
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of text strings. Returns list of float vectors."""
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    return embed_texts([query])[0]
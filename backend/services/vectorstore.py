import os
import uuid
from typing import Optional, List
import chromadb
from dotenv import load_dotenv

load_dotenv()

_client: Optional[chromadb.PersistentClient] = None
PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")


def init_vectorstore() -> None:
    """Initialize ChromaDB client on startup."""
    global _client
    os.makedirs(PERSIST_DIR, exist_ok=True)
    _client = chromadb.PersistentClient(path=PERSIST_DIR)
    print(f"[vectorstore] ChromaDB initialized at {PERSIST_DIR}")


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        init_vectorstore()
    return _client


def get_or_create_collection(collection_name: str):
    client = get_client()
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(
    collection_name: str,
    chunks: List[str],
    embeddings: List[list],
    metadatas: Optional[List[dict]] = None,
) -> int:
    """Add text chunks + embeddings to a collection."""
    collection = get_or_create_collection(collection_name)
    ids        = [f"{collection_name}_{uuid.uuid4().hex[:8]}_{i}" for i in range(len(chunks))]
    metadatas  = metadatas or [{"chunk_index": i} for i in range(len(chunks))]
    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(chunks)


def query_collection(
    collection_name: str,
    query_embedding: List[float],
    top_k: int = 5,
) -> List[str]:
    """Query a collection and return the top-k most similar chunks."""
    try:
        collection = get_or_create_collection(collection_name)
        count      = collection.count()
        if count == 0:
            return []
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, count),
            include=["documents"],
        )
        return results["documents"][0] if results["documents"] else []
    except Exception as e:
        print(f"[vectorstore] Query error: {e}")
        return []


def delete_collection(collection_name: str) -> None:
    """Delete a collection."""
    try:
        get_client().delete_collection(collection_name)
    except Exception:
        pass


def collection_exists(collection_name: str) -> bool:
    try:
        collections = get_client().list_collections()
        # ChromaDB 0.5+ returns strings; older versions return objects with .name
        names = []
        for c in collections:
            if isinstance(c, str):
                names.append(c)
            else:
                names.append(getattr(c, "name", str(c)))
        return collection_name in names
    except Exception:
        return False
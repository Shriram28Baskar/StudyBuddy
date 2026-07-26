import os
import uuid
from typing import Optional, List, Tuple
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
    query_embedding: Optional[List[float]] = None,
    query_embeddings: Optional[List[List[float]]] = None,
    top_k: int = 5,
) -> List[Tuple[str, dict, float]]:
    """
    Query a collection and return top-k results with metadata and distance.
    Supports either a single query_embedding or multiple query_embeddings.
    
    Returns list of (document_text, metadata_dict, cosine_distance).
    Note: ChromaDB cosine distance is (1 - similarity), so score = 1 - distance.
    """
    try:
        collection = get_or_create_collection(collection_name)
        count      = collection.count()
        if count == 0:
            return []
        embeddings_to_query = query_embeddings if query_embeddings else [query_embedding]
        
        results = collection.query(
            query_embeddings=embeddings_to_query,
            n_results=min(top_k, count),
            include=["documents", "metadatas", "distances"],
        )
        
        # Flatten results if multiple embeddings were provided
        docs = [d for sublist in results.get("documents", [[]]) for d in sublist]
        metas = [m for sublist in results.get("metadatas", [[]]) for m in sublist]
        distances = [d for sublist in results.get("distances", [[]]) for d in sublist]

        # Convert cosine distance → similarity score and deduplicate by text chunk
        scored_dict = {}
        for doc, meta, dist in zip(docs, metas, distances):
            score = max(0.0, 1.0 - dist)
            if doc not in scored_dict or score > scored_dict[doc][1]:
                scored_dict[doc] = (meta or {}, score)
                
        output = [(doc, meta, score) for doc, (meta, score) in scored_dict.items()]
        output.sort(key=lambda x: x[2], reverse=True)
        return output[:top_k]
    except Exception as e:
        print(f"[vectorstore] Query error: {e}")
        return []


def get_text_by_pages(collection_name: str, pages: List[int]) -> List[Tuple[str, dict, float]]:
    """
    Fetch all text chunks for specific pages.
    Returns (document_text, metadata_dict, 1.0) to match query_collection signature.
    """
    try:
        collection = get_or_create_collection(collection_name)
        if not pages:
            return []
        
        results = collection.get(
            where={"page_num": {"$in": pages}},
            include=["documents", "metadatas"]
        )
        docs = results.get("documents", [])
        metas = results.get("metadatas", [])
        return [(doc, meta or {}, 1.0) for doc, meta in zip(docs, metas)]
    except Exception as e:
        print(f"[vectorstore] get_text_by_pages error: {e}")
        return []


def add_image_chunks(
    collection_name: str,
    captions: List[str],
    embeddings: List[list],
    metadatas: List[dict],
) -> int:
    """Add image caption embeddings to the image sub-collection."""
    collection = get_or_create_collection(collection_name)
    ids = [
        f"{collection_name}_{m.get('page_num', 0)}_{m.get('image_index', i)}"
        for i, m in enumerate(metadatas)
    ]
    collection.add(
        ids=ids,
        documents=captions,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(captions)


def query_image_collection(
    collection_name: str,
    query_embedding: Optional[List[float]] = None,
    query_embeddings: Optional[List[List[float]]] = None,
    top_k: int = 3,
    type_filter: Optional[List[str]] = None,
) -> List[Tuple[dict, float]]:
    """
    Query the image caption collection and return top-k results.
    Supports single or multiple embeddings.

    Applies type_filter pre-filtering when provided.
    Returns list of (image_metadata_dict, combined_score).
    combined_score = cosine_similarity × type_confidence
    """
    try:
        collection = get_or_create_collection(collection_name)
        count      = collection.count()
        if count == 0:
            return []

        # Build where clause for type filtering
        where = None
        if type_filter:
            where = {"image_type": {"$in": type_filter}}

        # Fetch more than needed to allow post-filtering
        embeddings_to_query = query_embeddings if query_embeddings else [query_embedding]

        fetch_k = min(top_k * 4, count)
        query_kwargs = dict(
            query_embeddings=embeddings_to_query,
            n_results=fetch_k,
            include=["metadatas", "distances"],
        )
        if where:
            query_kwargs["where"] = where

        results = collection.query(**query_kwargs)

        metas = [m for sublist in results.get("metadatas", [[]]) for m in sublist]
        distances = [d for sublist in results.get("distances", [[]]) for d in sublist]

        scored_dict = {}
        for meta, dist in zip(metas, distances):
            if not meta:
                continue
            image_path = meta.get("image_path")
            if not image_path:
                continue
            
            similarity = max(0.0, 1.0 - dist)
            type_conf  = float(meta.get("type_confidence", 0.5))
            combined   = round(similarity * type_conf, 4)
            
            if image_path not in scored_dict or combined > scored_dict[image_path][1]:
                scored_dict[image_path] = (meta, combined)

        # Sort by combined score, take top_k
        scored = list(scored_dict.values())
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    except Exception as e:
        print(f"[vectorstore] Image query error: {e}")
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
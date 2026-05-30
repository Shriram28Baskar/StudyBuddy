import os
import re
import uuid
import aiofiles
import PyPDF2
from fastapi import UploadFile
from dotenv import load_dotenv

from services.embeddings import embed_texts, embed_query
from services.vectorstore import add_chunks, query_collection, delete_collection

load_dotenv()

UPLOAD_DIR      = os.getenv("UPLOAD_DIR", "./uploads")
CHUNK_SIZE      = 400    # tokens (approximated by words)
CHUNK_OVERLAP   = 50
MAX_FILE_MB     = int(os.getenv("MAX_UPLOAD_SIZE_MB", 10))


# ── Text extraction ───────────────────────────────────────────────────

def extract_text_from_pdf(path: str) -> str:
    text_parts = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


def extract_text_from_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_text(path: str, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        return extract_text_from_pdf(path)
    return extract_text_from_txt(path)


# ── Chunking ──────────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping word-based chunks."""
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    words = text.split()

    if not words:
        return []

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        if end == len(words):
            break
        start += chunk_size - overlap

    return chunks


# ── Main pipeline ─────────────────────────────────────────────────────

async def ingest_document(file: UploadFile) -> dict:
    """
    Full ingestion pipeline:
    1. Save file to disk
    2. Extract text
    3. Chunk text
    4. Generate embeddings
    5. Store in ChromaDB

    Returns metadata dict with doc_id and chunk_count.
    """
    # Validate file size
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_MB:
        raise ValueError(f"File too large ({size_mb:.1f} MB). Max: {MAX_FILE_MB} MB")

    # Save file
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    doc_id   = str(uuid.uuid4())
    ext      = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "txt"
    filepath = os.path.join(UPLOAD_DIR, f"{doc_id}.{ext}")

    async with aiofiles.open(filepath, "wb") as f:
        await f.write(content)

    # Extract text
    raw_text = extract_text(filepath, file.filename)
    if not raw_text.strip():
        raise ValueError("Could not extract text from document. Ensure it is not a scanned image.")

    # Chunk
    chunks = chunk_text(raw_text)
    if not chunks:
        raise ValueError("Document appears to be empty after text extraction.")

    # Embed
    embeddings = embed_texts(chunks)

    # Store in Chroma with metadata
    metadatas = [
        {"chunk_index": i, "filename": file.filename, "doc_id": doc_id}
        for i in range(len(chunks))
    ]
    add_chunks(
        collection_name=doc_id,
        chunks=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )

    return {
        "doc_id":      doc_id,
        "filename":    file.filename,
        "chunk_count": len(chunks),
        "filepath":    filepath,
    }


async def query_document(collection_name: str, question: str, top_k: int = 5) -> list[str]:
    """
    Query a stored document collection.
    Returns the top-k most relevant chunks.
    """
    q_embedding = embed_query(question)
    chunks = query_collection(
        collection_name=collection_name,
        query_embedding=q_embedding,
        top_k=top_k,
    )
    return chunks


async def delete_document(doc_id: str) -> None:
    """Remove document embeddings from ChromaDB and delete the file."""
    delete_collection(doc_id)
    for ext in ["pdf", "txt", "docx", "md"]:
        path = os.path.join(UPLOAD_DIR, f"{doc_id}.{ext}")
        if os.path.exists(path):
            os.remove(path)
            break
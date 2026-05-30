from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.document import QueryRequest, QueryResponse, UploadResponse
from services.rag import ingest_document, query_document, delete_document
from services.llm import build_rag_prompt, complete
from services.vectorstore import collection_exists

router = APIRouter()

ALLOWED_EXTENSIONS = {"pdf", "txt", "md"}


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Upload a document, extract text, chunk it, embed it, and store in ChromaDB."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )
    try:
        meta = await ingest_document(file)
        return UploadResponse(
            doc_id=meta["doc_id"],
            filename=meta["filename"],
            chunk_count=meta["chunk_count"],
            message=f"Document ingested successfully. {meta['chunk_count']} chunks stored.",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.post("/query", response_model=QueryResponse)
async def query_doc(req: QueryRequest):
    """Query a previously uploaded document using RAG."""
    if not collection_exists(req.collection):
        raise HTTPException(
            status_code=404,
            detail=f"Document collection '{req.collection}' not found. Upload the document first.",
        )
    try:
        chunks = await query_document(
            collection_name=req.collection,
            question=req.question,
            top_k=req.top_k,
        )
        if not chunks:
            return QueryResponse(
                answer="No relevant content found in the document for this question.",
                sources=[],
            )
        system_prompt = build_rag_prompt(chunks, req.question)
        answer = await complete(
            system_prompt=system_prompt,
            user_message=req.question,
            temperature=0.3,
        )
        return QueryResponse(
            answer=answer,
            sources=[c[:200] + "..." if len(c) > 200 else c for c in chunks],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.delete("/{doc_id}")
async def remove_document(doc_id: str):
    """Delete a document's embeddings and file."""
    try:
        await delete_document(doc_id)
        return {"message": f"Document {doc_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")
"""
routes/documents.py

Document Q&A routes — enhanced with the full multimodal RAG pipeline:
  1. Page-aware text ingestion (PyMuPDF)
  2. Image extraction, filtering, classification, captioning
  3. Query intent classification (adaptive retrieval)
  4. Hybrid retrieval (text + image captions, type-filtered)
  5. Confidence gating (expand or abort on weak evidence)
  6. Vision-grounded reasoning (actual images passed to LLM)
  7. Structured response with visual_evidence[], page_refs[], intent
"""

from __future__ import annotations

import asyncio
import base64
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File

from models.document import QueryRequest, QueryResponse, UploadResponse, Topic, VisualEvidence
from services.rag import (
    ingest_document, delete_document, UPLOAD_DIR,
    extract_text, ALLOWED_EXTENSIONS,
)
from services.rag_images import extract_and_store_images
from services.image_classifier import classify_images_batch
from services.query_classifier import classify as classify_query
from services.confidence_manager import (
    RetrievalEvidence, evaluate, build_insufficient_evidence_response,
    HIGH_THRESHOLD, MEDIUM_THRESHOLD,
)
from services.embeddings import embed_query
from services.vectorstore import (
    query_collection, query_image_collection,
    add_image_chunks, collection_exists, get_text_by_pages
)
from services.llm import (
    build_rag_prompt, build_multimodal_rag_prompt,
    complete, complete_with_vision_multimodal,
    build_topics_extraction_prompt, parse_json_response,
)

router = APIRouter()

_RELEVANCE_THRESHOLD = 0.30   # minimum combined score for images to be included


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """
    Upload a document, extract text + images, embed, classify, and store.
    Image classification runs asynchronously after text ingestion completes.
    """
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {ALLOWED_EXTENSIONS}",
        )
    try:
        # ── Text ingestion (Milestone 1) ──────────────────────────────────
        meta = await ingest_document(file)
        doc_id   = meta["doc_id"]
        filepath = meta["filepath"]

        # ── Topic extraction (uses already-saved file) ────────────────────
        topics: List[Topic] = []
        try:
            raw_text = extract_text(filepath, file.filename)
            prompt   = build_topics_extraction_prompt(raw_text)
            res_text = await complete(
                system_prompt=prompt,
                user_message="Extract topics from this document.",
                temperature=0.3,
            )
            parsed = parse_json_response(res_text)
            if parsed and isinstance(parsed, dict) and "topics" in parsed:
                topics = parsed["topics"]
        except Exception:
            pass   # topics are non-critical

        # ── Image extraction + classification (Milestones 2 & 3) ─────────
        image_count = 0
        if ext == "pdf":
            try:
                # Extract and filter images from PDF
                raw_images = await asyncio.to_thread(
                    extract_and_store_images, filepath, doc_id
                )
                if raw_images:
                    # Classify + caption each image (sequential, rate-limit-aware)
                    enriched = await classify_images_batch(raw_images)
                    image_count = len(enriched)

                    # Embed captions and store in {doc_id}_images collection
                    captions   = [img["caption"] for img in enriched]
                    embeddings = await asyncio.to_thread(
                        __import__("services.embeddings", fromlist=["embed_texts"]).embed_texts,
                        captions,
                    )
                    metadatas = [
                        {
                            "doc_id":          doc_id,
                            "page_num":        img["page_num"],
                            "image_index":     img["image_index"],
                            "image_path":      img["image_path"],
                            "image_url":       img["image_url"],
                            "width":           img["width"],
                            "height":          img["height"],
                            "image_type":      img["type"],
                            "type_confidence": img["confidence"],
                            "caption":         img["caption"],
                        }
                        for img in enriched
                    ]
                    add_image_chunks(
                        collection_name=f"{doc_id}_images",
                        captions=captions,
                        embeddings=embeddings,
                        metadatas=metadatas,
                    )
            except Exception as e:
                print(f"[documents] Image pipeline error for {doc_id}: {e}")
                # Image failure is non-fatal — text ingestion already succeeded

        return UploadResponse(
            doc_id=doc_id,
            filename=meta["filename"],
            chunk_count=meta["chunk_count"],
            image_count=image_count,
            message=(
                f"Document ingested successfully. "
                f"{meta['chunk_count']} text chunks and {image_count} images stored."
            ),
            topics=topics,
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


# ---------------------------------------------------------------------------
# Query — full multimodal pipeline
# ---------------------------------------------------------------------------

@router.post("/query", response_model=QueryResponse)
async def query_doc(req: QueryRequest):
    """
    Query a document using the full multimodal RAG pipeline:
    classify → hybrid retrieve → confidence gate → vision-grounded reasoning.
    """
    if not collection_exists(req.collection):
        raise HTTPException(
            status_code=404,
            detail=f"Document collection '{req.collection}' not found. Upload the document first.",
        )

    try:
        # ── Step 1: Query Classification (Milestone 4) ────────────────────
        intent = await classify_query(req.question)

        # ── Step 2: Embed the question ────────────────────────────────────
        q_embedding = await asyncio.to_thread(embed_query, req.question)

        # ── Step 3: Hybrid Retrieval ──────────────────────────────────────
        text_results = query_collection(
            collection_name=req.collection,
            query_embedding=q_embedding,
            top_k=req.top_k,
        )  # → [(text, metadata, score), ...]

        image_results = query_image_collection(
            collection_name=f"{req.collection}_images",
            query_embedding=q_embedding,
            top_k=3,
            type_filter=intent.type_filter or None,
        )  # → [(metadata, combined_score), ...]

        # Build evidence object for confidence manager
        evidence = RetrievalEvidence(
            text_results=text_results,
            image_results=image_results,
        )

        # ── Step 4: Confidence Gate & Stage 2 Recovery ─────────────────────────
        report = evaluate(evidence, intent)

        if report.level in ["medium", "low", "very_low"]:
            if report.level == "medium":
                # MEDIUM confidence — standard expansion
                expanded_text = query_collection(
                    collection_name=req.collection,
                    query_embedding=q_embedding,
                    top_k=req.top_k * 2,
                )
            else:
                # LOW/VERY_LOW confidence — aggressive expansion
                expanded_text = query_collection(
                    collection_name=req.collection,
                    query_embedding=q_embedding,
                    top_k=req.top_k * 3,
                )
                # Fetch neighboring pages (±1)
                top_pages = {int(meta.get("page_num", 1)) for _, meta, _ in expanded_text}
                neighbor_pages = set()
                for p in top_pages:
                    neighbor_pages.update([p - 1, p, p + 1])
                neighbor_pages = [p for p in neighbor_pages if p > 0]
                
                if neighbor_pages:
                    neighbor_text = get_text_by_pages(req.collection, neighbor_pages)
                    # Merge and deduplicate
                    seen = {doc for doc, _, _ in expanded_text}
                    for doc, meta, score in neighbor_text:
                        if doc not in seen:
                            seen.add(doc)
                            expanded_text.append((doc, meta, score))
            
            # Increase image fetch for all non-HIGH levels
            expanded_images = query_image_collection(
                collection_name=f"{req.collection}_images",
                query_embedding=q_embedding,
                top_k=10 if report.level in ["low", "very_low"] else 5,
                type_filter=None,   # relax type filter on expansion
            )
            
            evidence = RetrievalEvidence(
                text_results=expanded_text,
                image_results=expanded_images,
            )
            report = evaluate(evidence, intent)
            text_results = expanded_text
            image_results = expanded_images

        # ── Step 4.5: Stage 3 Semantic Query Expansion ─────────────────────
        if report.level in ["low", "very_low"]:
            # Semantic query expansion via LLM
            prompt = (
                "You are an AI generating search queries. Generate 3 semantic search variants "
                "of the following user query separated by newlines. DO NOT include the original query, "
                "numbers, or bullet points."
            )
            variants_text = await complete(prompt, req.question, max_tokens=100)
            variants = [v.strip() for v in variants_text.split("\n") if v.strip()]
            
            if variants:
                embeddings = await asyncio.gather(*[asyncio.to_thread(embed_query, v) for v in variants])
                sem_text = query_collection(
                    collection_name=req.collection,
                    query_embeddings=list(embeddings),
                    top_k=req.top_k * 3,
                )
                sem_images = query_image_collection(
                    collection_name=f"{req.collection}_images",
                    query_embeddings=list(embeddings),
                    top_k=10,
                    type_filter=None,
                )
                
                # Merge with previous best results
                seen_txt = {doc for doc, _, _ in text_results}
                for doc, meta, score in sem_text:
                    if doc not in seen_txt:
                        seen_txt.add(doc)
                        text_results.append((doc, meta, score))
                        
                seen_img = {meta.get("image_path") for meta, _ in image_results if meta.get("image_path")}
                for meta, score in sem_images:
                    img_path = meta.get("image_path")
                    if img_path and img_path not in seen_img:
                        seen_img.add(img_path)
                        image_results.append((meta, score))

                evidence = RetrievalEvidence(
                    text_results=text_results,
                    image_results=image_results,
                )
                report = evaluate(evidence, intent)

        # ── Step 4.75: Stage 4 Abort on VERY LOW ───────────────────────────
        if report.level == "very_low":
            # Return honest insufficient-evidence response only if EVERYTHING failed
            raw = build_insufficient_evidence_response(evidence, req.question)
            return QueryResponse(**raw)

        # ── Step 5: Filter images by relevance threshold ──────────────────
        relevant_images = [
            (meta, score) for meta, score in image_results
            if score >= _RELEVANCE_THRESHOLD
        ]

        # ── Step 6: Assemble visual evidence ──────────────────────────────
        visual_evidence: List[VisualEvidence] = []
        image_payloads: List[dict] = []    # for vision LLM

        for meta, score in relevant_images:
            img_path = meta.get("image_path", "")
            img_url  = meta.get("image_url", "")
            caption  = meta.get("caption", "")
            page_num = int(meta.get("page_num", 1))
            img_type = meta.get("image_type", "other")
            confidence = float(meta.get("type_confidence", 0.5))

            visual_evidence.append(VisualEvidence(
                page=page_num,
                type=img_type,
                confidence=round(confidence, 2),
                reason=caption[:200] + "..." if len(caption) > 200 else caption,
                url=img_url,
            ))

            # Load image bytes for vision LLM
            if img_path and os.path.exists(img_path):
                try:
                    with open(img_path, "rb") as f:
                        b64 = base64.b64encode(f.read()).decode("utf-8")
                    ext_img = img_path.rsplit(".", 1)[-1].lower()
                    media_type = "image/png" if ext_img == "png" else "image/jpeg"
                    image_payloads.append({
                        "b64":        b64,
                        "media_type": media_type,
                        "caption":    caption,
                        "page":       page_num,
                        "type":       img_type,
                    })
                except Exception:
                    pass   # skip unreadable images

        # ── Step 7: Collect page references ───────────────────────────────
        text_page_refs = list({
            int(meta.get("page_num", 1))
            for _, meta, _ in text_results
        })
        image_page_refs = [ve.page for ve in visual_evidence]
        page_refs = sorted(set(text_page_refs + image_page_refs))

        # ── Step 8: Generate answer ───────────────────────────────────────
        text_chunks = [doc for doc, _, _ in text_results]

        if image_payloads:
            # Vision-grounded reasoning path
            try:
                answer = await complete_with_vision_multimodal(
                    text_context=text_chunks,
                    images=image_payloads,
                    question=req.question,
                    intent=intent.intent,
                    max_tokens=2000,
                )
            except Exception:
                # Fallback to text-only if vision call fails after retries
                system_prompt = build_rag_prompt(text_chunks, req.question, intent.intent)
                answer = await complete(
                    system_prompt=system_prompt,
                    user_message=req.question,
                    temperature=0.3,
                    max_tokens=1500,
                )
        else:
            # Text-only path (unchanged behaviour)
            system_prompt = build_rag_prompt(text_chunks, req.question, intent.intent)
            answer = await complete(
                system_prompt=system_prompt,
                user_message=req.question,
                temperature=0.3,
                max_tokens=1500,
            )

        return QueryResponse(
            answer=answer,
            sources=[
                (c[:200] + "..." if len(c) > 200 else c)
                for c in text_chunks
            ],
            visual_evidence=visual_evidence,
            page_refs=page_refs,
            query_intent=intent.intent,
            retrieval_confidence=report.level,
            insufficient_evidence=False,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

@router.delete("/{doc_id}")
async def remove_document(doc_id: str):
    """Delete a document's embeddings, image collection, and all files."""
    try:
        await delete_document(doc_id)
        return {"message": f"Document {doc_id} deleted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")


# ---------------------------------------------------------------------------
# Topic extraction
# ---------------------------------------------------------------------------

@router.get("/{doc_id}/topics")
async def get_document_topics(doc_id: str, filename: str):
    """Extract 5 study topics from a previously uploaded document."""
    try:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"
        path = os.path.join(UPLOAD_DIR, f"{doc_id}.{ext}")
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Document file not found.")

        raw_text = extract_text(path, filename)
        if not raw_text.strip():
            raise HTTPException(status_code=422, detail="Empty document text.")

        prompt   = build_topics_extraction_prompt(raw_text)
        res_text = await complete(
            system_prompt=prompt,
            user_message="Extract topics from this document.",
            temperature=0.3,
        )
        parsed = parse_json_response(res_text)
        if parsed and isinstance(parsed, dict) and "topics" in parsed:
            return {"topics": parsed["topics"]}

        return {"topics": []}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Topic extraction failed: {str(e)}")
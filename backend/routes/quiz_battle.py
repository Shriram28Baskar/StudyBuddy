from __future__ import annotations
import asyncio
import json
import uuid
import re
import random
import string
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from pydantic import BaseModel
from services.llm import complete
from services.rag import extract_text
from middleware.auth import verify_firebase_token, verify_ws_token
import io
import pypdf

router = APIRouter()


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class PlayerState:
    player_id: str
    name: str
    score: int = 0
    answers: Dict[int, str] = field(default_factory=dict)
    ready: bool = False
    connected: bool = True
    ws: Optional[WebSocket] = None   # not serialized to JSON


@dataclass
class RoomState:
    room_id: str
    players: Dict[str, PlayerState] = field(default_factory=dict)
    questions: List[dict] = field(default_factory=list)
    current_q: int = 0
    status: str = 'waiting'          # waiting | active | finished
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    subject: str = 'General'
    difficulty: str = 'medium'
    question_timer_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# In-memory store
# ---------------------------------------------------------------------------

rooms: Dict[str, RoomState] = {}

# ---------------------------------------------------------------------------
# Pydantic request bodies
# ---------------------------------------------------------------------------

class CreateRoomBody(BaseModel):
    subject: str = 'General'
    difficulty: str = 'medium'
    player_name: str
    doc_questions: Optional[List[dict]] = None  # Pre-generated questions from a document


class JoinRoomBody(BaseModel):
    player_name: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cleanup_expired_rooms() -> None:
    """Clean up rooms older than 12 hours or finished rooms older than 1 hour to prevent memory leaks."""
    now = datetime.now(timezone.utc)
    expired = []
    for rid, r in list(rooms.items()):
        created = r.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age = now - created
        if age > timedelta(hours=12) or (r.status == 'finished' and age > timedelta(hours=1)):
            expired.append(rid)
    for rid in expired:
        rooms.pop(rid, None)


def _make_room_id() -> str:
    """Generate a 6-char uppercase alphanumeric room code."""
    _cleanup_expired_rooms()
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=6))
        if code not in rooms:
            return code


def _room_to_dict(room: RoomState) -> dict:
    return {
        'room_id': room.room_id,
        'status': room.status,
        'subject': room.subject,
        'difficulty': room.difficulty,
        'question_count': len(room.questions),
        'players': [
            {
                'id': p.player_id,
                'name': p.name,
                'score': p.score,
                'ready': p.ready,
                'connected': p.connected,
            }
            for p in room.players.values()
        ],
    }


async def broadcast(room: RoomState, message: dict) -> None:
    """Send a JSON message to every connected player in the room."""
    data = json.dumps(message)
    for p in room.players.values():
        if p.connected and p.ws is not None:
            try:
                await p.ws.send_text(data)
            except Exception:
                pass


async def send_to(ws: WebSocket, message: dict) -> None:
    """Send a JSON message to a single WebSocket."""
    try:
        await ws.send_text(json.dumps(message))
    except Exception:
        pass


def determine_winner(room: RoomState) -> str:
    """Return the winning player_id or 'tie'."""
    player_list = list(room.players.values())
    if len(player_list) == 0:
        return ''
    if len(player_list) == 1:
        return player_list[0].player_id
    p1, p2 = player_list[0], player_list[1]
    if p1.score > p2.score:
        return p1.player_id
    if p2.score > p1.score:
        return p2.player_id
    return 'tie'


# ---------------------------------------------------------------------------
# LLM question generation
# ---------------------------------------------------------------------------

async def generate_questions_from_document(doc_text: str, filename: str) -> List[dict]:
    """Generate 10 MCQ questions from a document's text content."""
    # Trim to fit context window comfortably
    trimmed = doc_text[:10000]
    system_prompt = (
        "You are an expert quiz generator. "
        "Generate exactly 10 multiple-choice questions based ONLY on the provided document content. "
        "Questions must test understanding of the concepts, facts, and ideas in the document. "
        "Return ONLY a valid JSON array with no additional text or markdown."
    )
    user_message = f"""Document content:
{trimmed}

Generate 10 MCQ questions from this document in this exact JSON format:
[
  {{
    "id": 1,
    "question": "Question text?",
    "options": {{"A": "option a", "B": "option b", "C": "option c", "D": "option d"}},
    "correct_answer": "A",
    "explanation": "Brief explanation why A is correct"
  }}
]
All questions must be based on the document content above. Return ONLY the JSON array."""

    try:
        raw = await complete(system_prompt, user_message, max_tokens=3000, temperature=0.4)
        raw = re.sub(r'```(?:json)?\s*', '', raw.strip()).rstrip('`').strip()
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            questions = json.loads(match.group())
            validated = []
            for i, q in enumerate(questions):
                if isinstance(q, dict) and 'question' in q and 'options' in q and 'correct_answer' in q:
                    q['id'] = i + 1
                    validated.append(q)
            return validated[:10]
        return []
    except Exception as e:
        print(f'[quiz_battle] Document question generation error: {e}')
        return []


async def generate_battle_questions(subject: str, difficulty: str) -> List[dict]:
    """Ask the LLM to generate 10 MCQ questions and parse the JSON response."""
    system_prompt = (
        f"You are a quiz generator. Generate exactly 10 multiple-choice questions "
        f"on {subject} at {difficulty} difficulty level. "
        f"Return ONLY a valid JSON array with no additional text or markdown."
    )
    user_message = f"""Generate 10 {difficulty} {subject} MCQ questions in this exact JSON format:
[
  {{
    "id": 1,
    "question": "Question text?",
    "options": {{"A": "option a", "B": "option b", "C": "option c", "D": "option d"}},
    "correct_answer": "A",
    "explanation": "Brief explanation why A is correct"
  }}
]
Generate varied questions covering different aspects of {subject}. Return ONLY the JSON array."""

    try:
        raw = await complete(system_prompt, user_message, max_tokens=3000, temperature=0.5)
        # Strip markdown fences if present
        raw = re.sub(r'```(?:json)?\s*', '', raw.strip()).rstrip('`').strip()
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            questions = json.loads(match.group())
            # Validate and normalize
            validated = []
            for i, q in enumerate(questions):
                if isinstance(q, dict) and 'question' in q and 'options' in q and 'correct_answer' in q:
                    q['id'] = i + 1
                    validated.append(q)
            return validated[:10]
        return []
    except Exception as e:
        print(f'[quiz_battle] Question generation error: {e}')
        return []


# ---------------------------------------------------------------------------
# Question timer loop
# ---------------------------------------------------------------------------

TIME_PER_QUESTION = 20   # seconds


async def question_timer_loop(room: RoomState) -> None:
    """
    For each question:
      1. Broadcast 'new_question' event with the question index.
      2. Wait TIME_PER_QUESTION seconds (or until both players answer).
      3. Auto-advance any unanswered players (score stays the same).
      4. Move to next question or finish game.
    """
    try:
        for q_idx in range(len(room.questions)):
            room.current_q = q_idx

            # Signal clients which question is now active
            await broadcast(room, {
                'type': 'new_question',
                'index': q_idx,
                'time_per_question': TIME_PER_QUESTION,
            })

            # Wait up to TIME_PER_QUESTION seconds, polling every 0.5s
            elapsed = 0.0
            while elapsed < TIME_PER_QUESTION:
                await asyncio.sleep(0.5)
                elapsed += 0.5
                # Check if all connected players have answered
                connected_players = [p for p in room.players.values() if p.connected]
                answered = all(q_idx in p.answers for p in connected_players)
                if answered and len(connected_players) > 0:
                    break

            # Time's up — broadcast timeout for this question
            await broadcast(room, {
                'type': 'question_timeout',
                'index': q_idx,
                'correct_answer': room.questions[q_idx].get('correct_answer', ''),
                'explanation': room.questions[q_idx].get('explanation', ''),
                'scores': {p.player_id: p.score for p in room.players.values()},
            })

            # Short pause before next question
            if q_idx < len(room.questions) - 1:
                await asyncio.sleep(2)

        # All questions done — send game_over
        room.status = 'finished'
        winner_id = determine_winner(room)
        final_scores = {p.player_id: p.score for p in room.players.values()}
        correct_answers = {str(q['id']): q.get('correct_answer', '') for q in room.questions}

        await broadcast(room, {
            'type': 'game_over',
            'winner': winner_id,
            'final_scores': final_scores,
            'correct_answers': correct_answers,
            'players': [
                {'id': p.player_id, 'name': p.name, 'score': p.score}
                for p in room.players.values()
            ],
        })

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f'[quiz_battle] Timer loop error: {e}')


# ---------------------------------------------------------------------------
# Room cleanup background task
# ---------------------------------------------------------------------------

async def cleanup_rooms() -> None:
    """Remove rooms older than 2 hours to free memory."""
    while True:
        await asyncio.sleep(3600)
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        to_delete = []
        for rid, r in list(rooms.items()):
            created = r.created_at
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created < cutoff:
                to_delete.append(rid)
        for rid in to_delete:
            room = rooms.pop(rid, None)
            if room and room.question_timer_task:
                room.question_timer_task.cancel()
        if to_delete:
            print(f'[quiz_battle] Cleaned up {len(to_delete)} expired room(s).')


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@router.post('/create')
async def create_room(body: CreateRoomBody):
    """Create a new quiz battle room and return the room_id + first player_id."""
    try:
        room_id = _make_room_id()
        player_id = str(uuid.uuid4())

        player = PlayerState(player_id=player_id, name=body.player_name.strip() or 'Player 1')
        room = RoomState(
            room_id=room_id,
            subject=body.subject,
            difficulty=body.difficulty,
        )
        # If host provided pre-generated doc questions, store them for use when game starts
        if body.doc_questions:
            room.questions = body.doc_questions[:10]
        room.players[player_id] = player
        rooms[room_id] = room

        return {'room_id': room_id, 'player_id': player_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/generate-from-doc')
async def generate_questions_from_doc_upload(
    file: UploadFile = File(...),
):
    """
    Host uploads a document (PDF, DOCX, TXT, PNG, JPG).
    Returns 10 generated MCQ questions from the document content.
    These can then be passed to /create as doc_questions.
    """
    filename = file.filename or 'document'
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'txt'
    allowed = {'pdf', 'txt', 'md', 'docx', 'pptx', 'csv', 'png', 'jpg', 'jpeg'}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(allowed))}")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='File exceeds 20 MB limit.')

    # Extract text
    try:
        with tempfile.NamedTemporaryFile(suffix=f'.{ext}', delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            doc_text = extract_text(tmp_path, filename)
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(status_code=422, detail=f'Could not extract text from file: {str(e)}')

    if not doc_text or not doc_text.strip():
        raise HTTPException(status_code=422, detail='No readable text found in the document.')

    # Generate questions
    questions = await generate_questions_from_document(doc_text, filename)
    if not questions:
        raise HTTPException(status_code=502, detail='Could not generate questions from the document. Please try a different file.')

    return {'questions': questions, 'source_file': filename, 'count': len(questions)}


@router.post('/join/{room_id}')
async def join_room(room_id: str, body: JoinRoomBody):
    """Join an existing room as the second player."""
    room_id = room_id.upper()
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail='Room not found')

    room = rooms[room_id]

    if room.status == 'finished':
        raise HTTPException(status_code=400, detail='Game has already ended')

    if len(room.players) >= 2:
        raise HTTPException(status_code=400, detail='Room is full (max 2 players)')

    try:
        player_id = str(uuid.uuid4())
        player = PlayerState(player_id=player_id, name=body.player_name.strip() or 'Player 2')
        room.players[player_id] = player

        return {'room_id': room_id, 'player_id': player_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/room/{room_id}')
async def get_room(room_id: str):
    """Get the current state of a room."""
    room_id = room_id.upper()
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail='Room not found')
    return _room_to_dict(rooms[room_id])


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket('/ws/{room_id}/{player_id}')
async def websocket_endpoint(
    ws: WebSocket,
    room_id: str,
    player_id: str,
    token: Optional[str] = Query(None),
):
    room_id = room_id.upper()

    # ── Authenticate WebSocket connection ────────────────────────────────────
    user = await verify_ws_token(ws, token)
    if user is None:
        return  # connection already closed by verify_ws_token

    # ── Validate room & player ──────────────────────────────────────────────
    if room_id not in rooms:
        await ws.close(code=4004, reason='Room not found')
        return

    room = rooms[room_id]

    if player_id not in room.players:
        await ws.close(code=4003, reason='Player not in room')
        return

    player = room.players[player_id]

    # ── Accept connection ───────────────────────────────────────────────────
    await ws.accept()
    player.ws = ws
    player.connected = True

    # ── Notify all players that someone joined ──────────────────────────────
    await broadcast(room, {
        'type': 'player_joined',
        'player': {
            'id': player.player_id,
            'name': player.name,
            'score': player.score,
            'ready': player.ready,
        },
    })

    # Send the newly connected player the current room state
    await send_to(ws, {
        'type': 'room_state',
        'room_id': room_id,
        'status': room.status,
        'subject': room.subject,
        'difficulty': room.difficulty,
        'players': [
            {'id': p.player_id, 'name': p.name, 'score': p.score, 'ready': p.ready, 'connected': p.connected}
            for p in room.players.values()
        ],
    })

    # ── Message loop ────────────────────────────────────────────────────────
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await send_to(ws, {'type': 'error', 'message': 'Invalid JSON'})
                continue

            msg_type = msg.get('type', '')

            # ── ping ────────────────────────────────────────────────────────
            if msg_type == 'ping':
                await send_to(ws, {'type': 'pong'})

            # ── ready ───────────────────────────────────────────────────────
            elif msg_type == 'ready':
                player.ready = True
                await broadcast(room, {
                    'type': 'player_ready',
                    'player_id': player_id,
                    'players': [
                        {'id': p.player_id, 'name': p.name, 'ready': p.ready}
                        for p in room.players.values()
                    ],
                })

                # Check if all connected players (2) are ready
                connected = [p for p in room.players.values() if p.connected]
                all_ready = len(connected) == 2 and all(p.ready for p in connected)

                if all_ready and room.status == 'waiting':
                    room.status = 'active'

                    # Generate questions if not already done
                    if not room.questions:
                        await broadcast(room, {'type': 'generating_questions'})
                        room.questions = await generate_battle_questions(room.subject, room.difficulty)

                        if not room.questions:
                            await broadcast(room, {
                                'type': 'error',
                                'message': 'Failed to generate questions. Please try again.',
                            })
                            room.status = 'waiting'
                            for p in room.players.values():
                                p.ready = False
                            continue

                    # Broadcast game start
                    await broadcast(room, {
                        'type': 'game_start',
                        'questions': room.questions,
                        'total_questions': len(room.questions),
                        'time_per_question': TIME_PER_QUESTION,
                        'subject': room.subject,
                        'difficulty': room.difficulty,
                    })

                    # Start the question timer loop as a background task
                    if room.question_timer_task and not room.question_timer_task.done():
                        room.question_timer_task.cancel()
                    room.question_timer_task = asyncio.create_task(question_timer_loop(room))

            # ── answer ──────────────────────────────────────────────────────
            elif msg_type == 'answer':
                q_index = msg.get('question_index')
                answer = msg.get('answer', '').upper()

                if room.status != 'active':
                    await send_to(ws, {'type': 'error', 'message': 'Game is not active'})
                    continue

                if q_index is None or not isinstance(q_index, int):
                    await send_to(ws, {'type': 'error', 'message': 'Invalid question_index'})
                    continue

                if q_index < 0 or q_index >= len(room.questions):
                    await send_to(ws, {'type': 'error', 'message': 'Question index out of range'})
                    continue

                # Only record first answer per question per player
                if q_index not in player.answers:
                    player.answers[q_index] = answer
                    correct = room.questions[q_index].get('correct_answer', '').upper()
                    if answer == correct:
                        player.score += 10

                    # Broadcast updated scores to all players
                    await broadcast(room, {
                        'type': 'score_update',
                        'scores': {p.player_id: p.score for p in room.players.values()},
                        'answerer': player_id,
                        'question_index': q_index,
                    })

                    # If both connected players have answered, immediately advance
                    connected_players = [p for p in room.players.values() if p.connected]
                    all_answered = all(q_index in p.answers for p in connected_players)

                    if all_answered and len(connected_players) > 0:
                        next_idx = q_index + 1
                        if next_idx < len(room.questions):
                            # Nudge the timer loop — it will notice and advance
                            pass  # Timer loop handles advancement autonomously
                        # Game over is also handled by the timer loop

            else:
                await send_to(ws, {'type': 'error', 'message': f'Unknown message type: {msg_type}'})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f'[quiz_battle] WebSocket error for {player_id}: {e}')
    finally:
        # ── Cleanup on disconnect ───────────────────────────────────────────
        player.connected = False
        player.ws = None

        await broadcast(room, {
            'type': 'player_left',
            'player_id': player_id,
            'player_name': player.name,
        })

        # If game was active, declare the remaining player the winner
        remaining = [p for p in room.players.values() if p.connected]
        if room.status == 'active' and remaining:
            room.status = 'finished'
            if room.question_timer_task and not room.question_timer_task.done():
                room.question_timer_task.cancel()

            winner = remaining[0]
            await broadcast(room, {
                'type': 'game_over',
                'winner': winner.player_id,
                'reason': 'opponent_disconnected',
                'final_scores': {p.player_id: p.score for p in room.players.values()},
                'correct_answers': {str(q['id']): q.get('correct_answer', '') for q in room.questions},
                'players': [
                    {'id': p.player_id, 'name': p.name, 'score': p.score}
                    for p in room.players.values()
                ],
            })

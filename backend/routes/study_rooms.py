from __future__ import annotations
import asyncio
import json
import os
import shutil
import uuid
import string
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from middleware.auth import verify_firebase_token, verify_ws_token

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants & colours
# ---------------------------------------------------------------------------

PARTICIPANT_COLORS = ['#9b6dff', '#5bbdff', '#ff9b5b', '#5bff9b', '#ff5b9b', '#ffdb5b']

UPLOADS_DIR = os.path.abspath(os.getenv('STUDY_ROOM_UPLOADS', './uploads/study-rooms'))
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class Participant:
    user_id: str
    name: str
    color: str
    connected: bool = True
    ws: Optional[WebSocket] = None
    is_muted: bool = True
    voice_enabled: bool = False


@dataclass
class TimerState:
    mode: str = 'pomodoro'          # pomodoro | stopwatch
    duration_seconds: int = 25 * 60
    remaining: int = 25 * 60
    is_running: bool = False
    phase: str = 'work'             # work | break


@dataclass
class StudyRoom:
    room_id: str
    join_code: str
    room_name: str
    subject: str
    host_id: str
    participants: Dict[str, Participant] = field(default_factory=dict)
    whiteboard: List[dict] = field(default_factory=list)   # last 500 draw events
    timer: TimerState = field(default_factory=TimerState)
    chat_history: List[dict] = field(default_factory=list) # last 50 messages
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    max_participants: int = 6
    timer_task: Optional[asyncio.Task] = None
    # ── PDF presentation ─────────────────────────────────────────
    document: Optional[dict] = None   # {filename, total_pages, current_page}
    page_annotations: Dict[int, List[dict]] = field(default_factory=dict)  # page → [draw events]


# ---------------------------------------------------------------------------
# In-memory stores
# ---------------------------------------------------------------------------

study_rooms: Dict[str, StudyRoom] = {}   # room_id  → StudyRoom
join_code_map: Dict[str, str] = {}        # join_code → room_id


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class CreateRoomRequest(BaseModel):
    room_name: str
    subject: str
    host_name: str
    max_participants: int = 6


class JoinRoomRequest(BaseModel):
    user_name: str


# ---------------------------------------------------------------------------
# Helper: generate unique join code & cleanup memory leaks
# ---------------------------------------------------------------------------

def _cleanup_expired_study_rooms() -> None:
    """Clean up study rooms older than 24 hours or with no participants for > 2 hours."""
    now = datetime.now(timezone.utc)
    expired = []
    for rid, r in list(study_rooms.items()):
        created = r.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age = now - created
        has_connected = any(p.connected for p in r.participants.values())
        if age > timedelta(hours=24) or (not has_connected and age > timedelta(hours=2)):
            expired.append(rid)
    for rid in expired:
        room = study_rooms.pop(rid, None)
        if room and room.join_code in join_code_map:
            join_code_map.pop(room.join_code, None)
        if room and room.timer_task:
            room.timer_task.cancel()


async def cleanup_rooms() -> None:
    """Background loop to remove expired study rooms."""
    while True:
        await asyncio.sleep(3600)
        _cleanup_expired_study_rooms()


def _generate_join_code() -> str:
    _cleanup_expired_study_rooms()
    chars = string.ascii_uppercase + string.digits
    while True:
        code = ''.join(random.choices(chars, k=6))
        if code not in join_code_map:
            return code


# ---------------------------------------------------------------------------
# Helper: serialise room state (JSON-safe)
# ---------------------------------------------------------------------------

def _room_state(room: StudyRoom) -> dict:
    return {
        'room_id': room.room_id,
        'room_name': room.room_name,
        'subject': room.subject,
        'host_id': room.host_id,
        'join_code': room.join_code,
        'max_participants': room.max_participants,
        'participants': [
            {
                'user_id': p.user_id,
                'name': p.name,
                'color': p.color,
                'connected': p.connected,
                'is_muted': p.is_muted,
                'voice_enabled': p.voice_enabled,
            }
            for p in room.participants.values()
        ],
        'whiteboard': room.whiteboard,
        'timer': {
            'remaining': room.timer.remaining,
            'is_running': room.timer.is_running,
            'phase': room.timer.phase,
            'mode': room.timer.mode,
            'duration_seconds': room.timer.duration_seconds,
        },
        'chat_history': room.chat_history,
        'created_at': room.created_at.isoformat(),
        'document': room.document,
    }


# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------

async def broadcast_room(room: StudyRoom, message: dict, exclude_user_id: str = None):
    data = json.dumps(message)
    for p in room.participants.values():
        if p.connected and p.ws and p.user_id != exclude_user_id:
            try:
                await p.ws.send_text(data)
            except Exception:
                p.connected = False


async def send_to_user(ws: WebSocket, message: dict):
    try:
        await ws.send_text(json.dumps(message))
    except Exception:
        pass


async def send_to_specific_user(room: StudyRoom, target_user_id: str, message: dict):
    """Send a message to a specific user in the room."""
    p = room.participants.get(target_user_id)
    if p and p.connected and p.ws:
        try:
            await p.ws.send_text(json.dumps(message))
        except Exception:
            p.connected = False


# ---------------------------------------------------------------------------
# Timer coroutine
# ---------------------------------------------------------------------------

async def run_timer(room: StudyRoom):
    """Tick every second while timer is running; switch phases on expiry."""
    try:
        while room.timer.remaining > 0 and room.timer.is_running:
            await asyncio.sleep(1)
            if not room.timer.is_running:
                break
            room.timer.remaining -= 1
            await broadcast_room(room, {
                'type': 'timer_tick',
                'remaining_seconds': room.timer.remaining,
                'phase': room.timer.phase,
            })

        if room.timer.remaining <= 0:
            room.timer.is_running = False
            # Switch phase
            if room.timer.phase == 'work':
                room.timer.phase = 'break'
                room.timer.remaining = 5 * 60
            else:
                room.timer.phase = 'work'
                room.timer.remaining = room.timer.duration_seconds
            await broadcast_room(room, {
                'type': 'timer_phase_complete',
                'new_phase': room.timer.phase,
                'remaining_seconds': room.timer.remaining,
            })
    except asyncio.CancelledError:
        pass


def _cancel_timer_task(room: StudyRoom):
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_task = None


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@router.post('/create')
async def create_room(body: CreateRoomRequest):
    """Create a new study room, returning credentials for the host."""
    try:
        room_id = str(uuid.uuid4())
        join_code = _generate_join_code()
        host_user_id = str(uuid.uuid4())

        host = Participant(
            user_id=host_user_id,
            name=body.host_name,
            color=PARTICIPANT_COLORS[0],
        )

        room = StudyRoom(
            room_id=room_id,
            join_code=join_code,
            room_name=body.room_name,
            subject=body.subject,
            host_id=host_user_id,
            max_participants=min(max(body.max_participants, 2), 6),
        )
        room.participants[host_user_id] = host

        study_rooms[room_id] = room
        join_code_map[join_code] = room_id

        return {
            'room_id': room_id,
            'join_code': join_code,
            'host_user_id': host_user_id,
            'room_state': _room_state(room),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/join/{join_code}')
async def join_room(join_code: str, body: JoinRoomRequest):
    """Join an existing room by its 6-character code."""
    try:
        join_code = join_code.upper()
        room_id = join_code_map.get(join_code)
        if not room_id:
            raise HTTPException(status_code=404, detail='Room not found. Check the code and try again.')

        room = study_rooms.get(room_id)
        if not room:
            raise HTTPException(status_code=404, detail='Room has been closed.')

        # Count currently connected participants
        connected_count = sum(1 for p in room.participants.values() if p.connected)
        if connected_count >= room.max_participants:
            raise HTTPException(status_code=400, detail='Room is full.')

        # Assign next available colour
        used_colors = {p.color for p in room.participants.values()}
        color = next((c for c in PARTICIPANT_COLORS if c not in used_colors), PARTICIPANT_COLORS[len(room.participants) % len(PARTICIPANT_COLORS)])

        user_id = str(uuid.uuid4())
        participant = Participant(user_id=user_id, name=body.user_name, color=color)
        room.participants[user_id] = participant

        return {
            'room_id': room_id,
            'user_id': user_id,
            'room_state': _room_state(room),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get('/active')
async def list_active_rooms(user_id: str = Query(...)):
    """Return all rooms where the given user is (or was) a participant."""
    try:
        result = []
        for room in study_rooms.values():
            if user_id in room.participants:
                result.append(_room_state(room))
        return {'rooms': result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete('/{room_id}')
async def delete_room(room_id: str):
    """Delete a room immediately."""
    try:
        room = study_rooms.pop(room_id, None)
        if not room:
            raise HTTPException(status_code=404, detail='Room not found.')
        join_code_map.pop(room.join_code, None)
        _cancel_timer_task(room)
        # Clean up uploaded files
        room_dir = os.path.join(UPLOADS_DIR, room_id)
        if os.path.exists(room_dir):
            shutil.rmtree(room_dir, ignore_errors=True)
        return {'detail': 'Room deleted.'}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post('/{room_id}/upload-document')
async def upload_document(room_id: str, user_id: str = Query(...), file: UploadFile = File(...)):
    """Upload a PDF document (host only). Broadcasts to all participants."""
    room = study_rooms.get(room_id)
    if not room:
        raise HTTPException(status_code=404, detail='Room not found.')
    if user_id != room.host_id:
        raise HTTPException(status_code=403, detail='Only the host can upload documents.')
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail='Only PDF files are supported.')

    # Read file content
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail='File too large. Max 50MB.')

    # Save to disk
    room_dir = os.path.join(UPLOADS_DIR, room_id)
    os.makedirs(room_dir, exist_ok=True)
    filepath = os.path.join(room_dir, file.filename)
    with open(filepath, 'wb') as f:
        f.write(content)

    # Try to get page count via pypdf (optional)
    total_pages = 1
    try:
        from pypdf import PdfReader
        reader = PdfReader(filepath)
        total_pages = len(reader.pages)
    except Exception:
        total_pages = 1  # fallback

    # Update room state
    room.document = {
        'filename': file.filename,
        'total_pages': total_pages,
        'current_page': 1,
    }
    room.whiteboard = []  # clear whiteboard when new doc is uploaded
    room.page_annotations = {}  # reset annotations

    # Broadcast to all participants
    await broadcast_room(room, {
        'type': 'document_uploaded',
        'document': room.document,
        'url': f'/study-rooms/{room_id}/document',
    })

    return {'detail': 'Document uploaded.', 'document': room.document}


@router.get('/{room_id}/document')
async def get_document(room_id: str):
    """Serve the uploaded PDF document."""
    room = study_rooms.get(room_id)
    if not room or not room.document:
        raise HTTPException(status_code=404, detail='No document found.')

    filepath = os.path.join(UPLOADS_DIR, room_id, room.document['filename'])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail='Document file missing.')

    return FileResponse(
        filepath,
        media_type='application/pdf',
        filename=room.document['filename'],
    )


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@router.websocket('/ws/{room_id}/{user_id}')
async def room_websocket(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    token: Optional[str] = Query(None),
):
    """
    Real-time WebSocket for a study room.

    On connect  → send room_state to newcomer, broadcast join event.
    Messages    → draw / erase / text / clear / undo / cursor / chat /
                  timer_start / timer_pause / timer_reset.
    On close    → mark disconnected, broadcast leave event.
    """
    room = study_rooms.get(room_id)
    if not room:
        await websocket.close(code=4004)
        return

    participant = room.participants.get(user_id)
    if not participant:
        await websocket.close(code=4003)
        return

    # ── Authenticate WebSocket connection ──────────────────────────────────
    user = await verify_ws_token(websocket, token)
    if user is None:
        return  # connection already closed by verify_ws_token

    await websocket.accept()

    # Register connection
    participant.ws = websocket
    participant.connected = True

    # ── Send full room state to the newcomer ────────────────────────────────
    await send_to_user(websocket, {
        'type': 'room_state',
        'participants': [
            {
                'user_id': p.user_id,
                'name': p.name,
                'color': p.color,
                'connected': p.connected,
                'is_muted': p.is_muted,
                'voice_enabled': p.voice_enabled,
            }
            for p in room.participants.values()
        ],
        'whiteboard': room.whiteboard,
        'timer': {
            'remaining': room.timer.remaining,
            'is_running': room.timer.is_running,
            'phase': room.timer.phase,
            'mode': room.timer.mode,
            'duration_seconds': room.timer.duration_seconds,
        },
        'chat_history': room.chat_history,
        'document': room.document,
    })

    # ── Broadcast join event to everyone else ───────────────────────────────
    await broadcast_room(room, {
        'type': 'join',
        'user': {
            'user_id': participant.user_id,
            'name': participant.name,
            'color': participant.color,
            'connected': True,
        },
    }, exclude_user_id=user_id)

    # ── Message loop ────────────────────────────────────────────────────────
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get('type', '')

            # ── Whiteboard events ──────────────────────────────────────────
            if msg_type == 'draw':
                event = {
                    'type': 'draw',
                    'path': msg.get('path', []),
                    'color': msg.get('color', '#ffffff'),
                    'width': msg.get('width', 3),
                    'user_id': user_id,
                }
                room.whiteboard.append(event)
                if len(room.whiteboard) > 500:
                    room.whiteboard = room.whiteboard[-500:]
                # Store per-page annotation if PDF is active
                if room.document:
                    page = room.document.get('current_page', 1)
                    if page not in room.page_annotations:
                        room.page_annotations[page] = []
                    room.page_annotations[page].append(event)
                    if len(room.page_annotations[page]) > 500:
                        room.page_annotations[page] = room.page_annotations[page][-500:]
                await broadcast_room(room, event)

            elif msg_type == 'erase':
                event = {
                    'type': 'erase',
                    'path': msg.get('path', []),
                    'width': msg.get('width', 20),
                    'user_id': user_id,
                }
                room.whiteboard.append(event)
                if len(room.whiteboard) > 500:
                    room.whiteboard = room.whiteboard[-500:]
                # Store per-page annotation if PDF is active
                if room.document:
                    page = room.document.get('current_page', 1)
                    if page not in room.page_annotations:
                        room.page_annotations[page] = []
                    room.page_annotations[page].append(event)
                    if len(room.page_annotations[page]) > 500:
                        room.page_annotations[page] = room.page_annotations[page][-500:]
                await broadcast_room(room, event)

            elif msg_type == 'text':
                event = {
                    'type': 'text',
                    'x': msg.get('x', 0),
                    'y': msg.get('y', 0),
                    'content': msg.get('content', ''),
                    'color': msg.get('color', '#ffffff'),
                    'user_id': user_id,
                }
                room.whiteboard.append(event)
                if len(room.whiteboard) > 500:
                    room.whiteboard = room.whiteboard[-500:]
                # Store per-page annotation if PDF is active
                if room.document:
                    page = room.document.get('current_page', 1)
                    if page not in room.page_annotations:
                        room.page_annotations[page] = []
                    room.page_annotations[page].append(event)
                    if len(room.page_annotations[page]) > 500:
                        room.page_annotations[page] = room.page_annotations[page][-500:]
                await broadcast_room(room, event)

            elif msg_type == 'clear':
                room.whiteboard = []
                await broadcast_room(room, {'type': 'clear', 'user_id': user_id})

            elif msg_type == 'undo':
                # Remove the last whiteboard event that belongs to this user
                for i in range(len(room.whiteboard) - 1, -1, -1):
                    if room.whiteboard[i].get('user_id') == user_id:
                        room.whiteboard.pop(i)
                        break
                await broadcast_room(room, {
                    'type': 'whiteboard_state',
                    'events': room.whiteboard,
                })

            # ── Cursor position ────────────────────────────────────────────
            elif msg_type == 'cursor':
                await broadcast_room(room, {
                    'type': 'cursor',
                    'user_id': user_id,
                    'x': msg.get('x', 0),
                    'y': msg.get('y', 0),
                    'color': participant.color,
                    'name': participant.name,
                }, exclude_user_id=user_id)

            # ── Chat message ───────────────────────────────────────────────
            elif msg_type == 'chat':
                chat_msg = {
                    'type': 'chat',
                    'user_id': user_id,
                    'user_name': msg.get('user_name', participant.name),
                    'message': msg.get('message', ''),
                    'color': participant.color,
                    'timestamp': datetime.utcnow().isoformat(),
                }
                room.chat_history.append(chat_msg)
                if len(room.chat_history) > 50:
                    room.chat_history = room.chat_history[-50:]
                await broadcast_room(room, chat_msg)

            # ── Timer controls ─────────────────────────────────────────────
            elif msg_type == 'timer_start':
                duration_min = int(msg.get('duration_minutes', 25))
                duration_sec = duration_min * 60
                _cancel_timer_task(room)
                room.timer.duration_seconds = duration_sec
                room.timer.remaining = duration_sec
                room.timer.is_running = True
                room.timer.phase = 'work'
                await broadcast_room(room, {
                    'type': 'timer_state',
                    'remaining_seconds': room.timer.remaining,
                    'is_running': room.timer.is_running,
                    'phase': room.timer.phase,
                    'mode': room.timer.mode,
                    'duration_seconds': room.timer.duration_seconds,
                })
                room.timer_task = asyncio.create_task(run_timer(room))

            elif msg_type == 'timer_pause':
                _cancel_timer_task(room)
                room.timer.is_running = False
                await broadcast_room(room, {
                    'type': 'timer_state',
                    'remaining_seconds': room.timer.remaining,
                    'is_running': False,
                    'phase': room.timer.phase,
                    'mode': room.timer.mode,
                    'duration_seconds': room.timer.duration_seconds,
                })

            elif msg_type == 'timer_reset':
                _cancel_timer_task(room)
                room.timer.is_running = False
                room.timer.remaining = room.timer.duration_seconds
                room.timer.phase = 'work'
                await broadcast_room(room, {
                    'type': 'timer_state',
                    'remaining_seconds': room.timer.remaining,
                    'is_running': False,
                    'phase': room.timer.phase,
                    'mode': room.timer.mode,
                    'duration_seconds': room.timer.duration_seconds,
                })

            # ── PDF page navigation (host only) ───────────────────────────
            elif msg_type == 'page_change':
                if user_id == room.host_id and room.document:
                    page = max(1, min(int(msg.get('page', 1)), room.document['total_pages']))
                    room.document['current_page'] = page
                    # Load page-specific annotations into whiteboard
                    room.whiteboard = room.page_annotations.get(page, [])
                    await broadcast_room(room, {
                        'type': 'page_changed',
                        'page': page,
                        'total_pages': room.document['total_pages'],
                        'whiteboard': room.whiteboard,
                    })

            elif msg_type == 'clear_page_annotations':
                if room.document:
                    page = room.document.get('current_page', 1)
                    room.page_annotations[page] = []
                    room.whiteboard = []
                    await broadcast_room(room, {
                        'type': 'clear',
                        'user_id': user_id,
                    })

            # ── WebRTC signaling (relay only) ─────────────────────────────
            elif msg_type in ('rtc_offer', 'rtc_answer', 'ice_candidate'):
                target_id = msg.get('to_user_id')
                if target_id:
                    await send_to_specific_user(room, target_id, {
                        'type': msg_type,
                        'from_user_id': user_id,
                        'payload': msg.get('payload'),
                    })

            # ── Voice state ───────────────────────────────────────────────
            elif msg_type == 'voice_state':
                participant.is_muted = msg.get('is_muted', True)
                participant.voice_enabled = msg.get('voice_enabled', False)
                await broadcast_room(room, {
                    'type': 'voice_state',
                    'user_id': user_id,
                    'is_muted': participant.is_muted,
                    'voice_enabled': participant.voice_enabled,
                })

            elif msg_type == 'speaker_activity':
                await broadcast_room(room, {
                    'type': 'speaker_activity',
                    'user_id': user_id,
                    'is_speaking': msg.get('is_speaking', False),
                    'volume': msg.get('volume', 0),
                }, exclude_user_id=user_id)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # ── Disconnect cleanup ───────────────────────────────────────────────
        participant.connected = False
        participant.ws = None
        await broadcast_room(room, {
            'type': 'leave',
            'user_id': user_id,
            'name': participant.name,
        })

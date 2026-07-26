import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000')
  .replace('http://', 'ws://')
  .replace('https://', 'wss://')

/**
 * useStudyRoom – manages the WebSocket connection to a study room.
 *
 * @param {string} roomId
 * @param {string} userId
 * @returns {{ room, send, isConnected }}
 */
export function useStudyRoom(roomId, userId) {
  const [room, setRoom] = useState({
    participants: [],
    whiteboard: [],
    timer: {
      remaining: 25 * 60,
      is_running: false,
      phase: 'work',
      mode: 'pomodoro',
      duration_seconds: 25 * 60,
    },
    chatMessages: [],
    cursors: {},           // userId → { x, y, color, name }
    // ── PDF document state ──
    document: null,        // { filename, total_pages, current_page } | null
    // ── Voice state ──
    voiceStates: {},       // userId → { is_muted, voice_enabled }
    speakingUsers: {},     // userId → { isSpeaking, volume }
  })

  const ws = useRef(null)
  const [isConnected, setIsConnected] = useState(false)

  // Keep a stable reference to the latest room for use inside handleMessage
  const roomRef = useRef(room)
  useEffect(() => { roomRef.current = room }, [room])

  // External signaling callback (set by useVoiceChat via setSignalingHandler)
  const signalingHandlerRef = useRef(null)

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'room_state':
        setRoom(s => ({
          ...s,
          participants: msg.participants ?? [],
          whiteboard: msg.whiteboard ?? [],
          timer: msg.timer
            ? {
                remaining: msg.timer.remaining,
                is_running: msg.timer.is_running,
                phase: msg.timer.phase,
                mode: msg.timer.mode ?? 'pomodoro',
                duration_seconds: msg.timer.duration_seconds ?? 25 * 60,
              }
            : s.timer,
          chatMessages: msg.chat_history ?? [],
          document: msg.document ?? null,
          // Populate voice states from participants
          voiceStates: Object.fromEntries(
            (msg.participants ?? []).map(p => [p.user_id, {
              is_muted: p.is_muted ?? true,
              voice_enabled: p.voice_enabled ?? false,
            }])
          ),
        }))
        break

      case 'draw':
      case 'erase':
      case 'text':
        setRoom(s => ({ ...s, whiteboard: [...s.whiteboard, msg] }))
        break

      case 'clear':
        setRoom(s => ({ ...s, whiteboard: [] }))
        break

      case 'whiteboard_state':
        setRoom(s => ({ ...s, whiteboard: msg.events ?? [] }))
        break

      case 'cursor':
        setRoom(s => ({
          ...s,
          cursors: {
            ...s.cursors,
            [msg.user_id]: { x: msg.x, y: msg.y, color: msg.color, name: msg.name },
          },
        }))
        break

      case 'join':
        setRoom(s => ({
          ...s,
          participants: [
            ...s.participants.filter(p => p.user_id !== msg.user.user_id),
            msg.user,
          ],
        }))
        break

      case 'leave':
        setRoom(s => ({
          ...s,
          participants: s.participants.map(p =>
            p.user_id === msg.user_id ? { ...p, connected: false } : p
          ),
          // Remove disconnected user cursor
          cursors: Object.fromEntries(
            Object.entries(s.cursors).filter(([id]) => id !== msg.user_id)
          ),
          // Clear speaking state
          speakingUsers: Object.fromEntries(
            Object.entries(s.speakingUsers).filter(([id]) => id !== msg.user_id)
          ),
        }))
        break

      case 'chat':
        setRoom(s => ({ ...s, chatMessages: [...s.chatMessages, msg] }))
        break

      case 'timer_tick':
        setRoom(s => ({
          ...s,
          timer: {
            ...s.timer,
            remaining: msg.remaining_seconds,
            phase: msg.phase,
            is_running: true,
          },
        }))
        break

      case 'timer_state':
        setRoom(s => ({
          ...s,
          timer: {
            remaining: msg.remaining_seconds,
            is_running: msg.is_running,
            phase: msg.phase,
            mode: msg.mode ?? s.timer.mode,
            duration_seconds: msg.duration_seconds ?? s.timer.duration_seconds,
          },
        }))
        break

      case 'timer_phase_complete':
        setRoom(s => ({
          ...s,
          timer: {
            ...s.timer,
            phase: msg.new_phase,
            remaining: msg.remaining_seconds ?? s.timer.remaining,
            is_running: false,
          },
        }))
        break

      // ── PDF document events ──────────────────────────────────────────────
      case 'document_uploaded':
        setRoom(s => ({
          ...s,
          document: msg.document ?? null,
          whiteboard: [],   // clear whiteboard for new document
        }))
        break

      case 'page_changed':
        setRoom(s => ({
          ...s,
          document: s.document
            ? { ...s.document, current_page: msg.page, total_pages: msg.total_pages }
            : null,
          whiteboard: msg.whiteboard ?? [],  // load page annotations
        }))
        break

      // ── Voice / WebRTC events ────────────────────────────────────────────
      case 'voice_state':
        setRoom(s => ({
          ...s,
          voiceStates: {
            ...s.voiceStates,
            [msg.user_id]: {
              is_muted: msg.is_muted ?? true,
              voice_enabled: msg.voice_enabled ?? false,
            },
          },
          participants: s.participants.map(p =>
            p.user_id === msg.user_id
              ? { ...p, is_muted: msg.is_muted, voice_enabled: msg.voice_enabled }
              : p
          ),
        }))
        // Forward to voice chat handler
        if (signalingHandlerRef.current) signalingHandlerRef.current(msg)
        break

      case 'speaker_activity':
        setRoom(s => ({
          ...s,
          speakingUsers: {
            ...s.speakingUsers,
            [msg.user_id]: { isSpeaking: msg.is_speaking, volume: msg.volume ?? 0 },
          },
        }))
        // Forward to voice chat handler
        if (signalingHandlerRef.current) signalingHandlerRef.current(msg)
        break

      case 'rtc_offer':
      case 'rtc_answer':
      case 'ice_candidate':
        // Forward signaling messages to the voice chat handler
        if (signalingHandlerRef.current) signalingHandlerRef.current(msg)
        break

      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!roomId || !userId) return

    const url = `${WS_BASE}/study-rooms/ws/${roomId}/${userId}`
    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => setIsConnected(true)
    socket.onclose = () => setIsConnected(false)
    socket.onerror = () => setIsConnected(false)
    socket.onmessage = (e) => {
      try {
        handleMessage(JSON.parse(e.data))
      } catch (_) {
        // ignore malformed frames
      }
    }

    return () => {
      socket.close()
      ws.current = null
    }
  }, [roomId, userId, handleMessage])

  const send = useCallback((message) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message))
    }
  }, [])

  // Allow voice chat hook to register its signaling handler
  const setSignalingHandler = useCallback((handler) => {
    signalingHandlerRef.current = handler
  }, [])

  return { room, send, isConnected, setSignalingHandler }
}

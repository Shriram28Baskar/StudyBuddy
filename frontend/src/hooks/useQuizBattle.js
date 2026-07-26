import { useState, useEffect, useRef, useCallback } from 'react'

const WS_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000')
  .replace(/^http:\/\//,  'ws://')
  .replace(/^https:\/\//, 'wss://')

/**
 * useQuizBattle
 * Manages the WebSocket lifecycle and game state for a 1v1 quiz battle.
 *
 * @param {string|null} roomId   - The 6-char room code
 * @param {string|null} playerId - UUID of the local player
 * @returns {{ gameState, sendAnswer, sendReady, isConnected }}
 */
export function useQuizBattle(roomId, playerId) {
  const [gameState, setGameState] = useState({
    status: 'connecting',   // connecting | waiting | waiting_start | active | finished | disconnected
    players: {},            // { [playerId]: { id, name, score, ready } }
    questions: [],          // full question list from game_start
    currentQuestion: 0,     // 0-based index
    scores: {},             // { [playerId]: score }
    myAnswer: null,         // letter the local player chose for current question
    winner: null,           // player_id or 'tie'
    finalScores: null,      // { [playerId]: score }
    correctAnswers: null,   // { [questionId]: letter }
    timeRemaining: 20,
    error: null,
    subject: '',
    difficulty: '',
    generatingQuestions: false,
  })

  const ws           = useRef(null)
  const timerRef     = useRef(null)
  const [isConnected, setIsConnected] = useState(false)

  // ── Timer helper ──────────────────────────────────────────────────────────
  const startTimer = useCallback((seconds) => {
    clearInterval(timerRef.current)
    let t = seconds
    setGameState(s => ({ ...s, timeRemaining: t }))
    timerRef.current = setInterval(() => {
      t -= 1
      setGameState(s => ({ ...s, timeRemaining: Math.max(0, t) }))
      if (t <= 0) clearInterval(timerRef.current)
    }, 1000)
  }, [])

  // ── Message handler ───────────────────────────────────────────────────────
  const handleServerMessage = useCallback((msg) => {
    switch (msg.type) {

      case 'room_state':
        // Full room snapshot sent on initial connect
        setGameState(s => ({
          ...s,
          status: s.status === 'connecting' ? 'waiting' : s.status,
          subject: msg.subject || s.subject,
          difficulty: msg.difficulty || s.difficulty,
          players: msg.players
            ? Object.fromEntries(msg.players.map(p => [p.id, p]))
            : s.players,
        }))
        break

      case 'player_joined':
        setGameState(s => ({
          ...s,
          players: {
            ...s.players,
            [msg.player.id]: msg.player,
          },
        }))
        break

      case 'player_ready':
        // Update ready flags for all players
        if (msg.players) {
          setGameState(s => ({
            ...s,
            players: Object.fromEntries(
              msg.players.map(p => [p.id, { ...(s.players[p.id] || {}), ...p }])
            ),
          }))
        }
        break

      case 'generating_questions':
        setGameState(s => ({ ...s, generatingQuestions: true }))
        break

      case 'game_start':
        clearInterval(timerRef.current)
        setGameState(s => ({
          ...s,
          status: 'active',
          questions: msg.questions || [],
          currentQuestion: 0,
          scores: Object.fromEntries(
            Object.keys(s.players).map(id => [id, 0])
          ),
          myAnswer: null,
          timeRemaining: msg.time_per_question || 20,
          generatingQuestions: false,
          winner: null,
          finalScores: null,
          correctAnswers: null,
        }))
        startTimer(msg.time_per_question || 20)
        break

      case 'new_question':
        clearInterval(timerRef.current)
        setGameState(s => ({
          ...s,
          currentQuestion: msg.index,
          myAnswer: null,
          timeRemaining: msg.time_per_question || 20,
        }))
        startTimer(msg.time_per_question || 20)
        break

      case 'question_timeout':
        // Server advanced; show correct answer briefly before next_question
        clearInterval(timerRef.current)
        setGameState(s => ({
          ...s,
          scores: msg.scores || s.scores,
          timeRemaining: 0,
        }))
        break

      case 'score_update':
        setGameState(s => ({
          ...s,
          scores: msg.scores || s.scores,
        }))
        break

      case 'game_over':
        clearInterval(timerRef.current)
        setGameState(s => ({
          ...s,
          status: 'finished',
          winner: msg.winner,
          finalScores: msg.final_scores || s.scores,
          correctAnswers: msg.correct_answers || {},
          timeRemaining: 0,
        }))
        break

      case 'player_left':
        setGameState(s => ({
          ...s,
          players: {
            ...s.players,
            [msg.player_id]: {
              ...(s.players[msg.player_id] || {}),
              connected: false,
            },
          },
          error: `${msg.player_name || 'Opponent'} disconnected`,
        }))
        break

      case 'error':
        setGameState(s => ({ ...s, error: msg.message, generatingQuestions: false }))
        break

      default:
        break
    }
  }, [startTimer])

  // ── Connect on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId || !playerId) return

    const url = `${WS_BASE}/quiz-battle/ws/${roomId}/${playerId}`
    const socket = new WebSocket(url)
    ws.current = socket

    socket.onopen = () => {
      setIsConnected(true)
      setGameState(s => ({ ...s, status: 'waiting', error: null }))
    }

    socket.onclose = () => {
      setIsConnected(false)
      setGameState(s => ({ ...s, status: 'disconnected' }))
    }

    socket.onerror = () => {
      setGameState(s => ({ ...s, error: 'Connection lost. Please refresh.' }))
    }

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleServerMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    return () => {
      socket.close()
      clearInterval(timerRef.current)
    }
  }, [roomId, playerId, handleServerMessage])

  // ── Actions ───────────────────────────────────────────────────────────────
  const sendReady = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ready' }))
      setGameState(s => ({ ...s, status: 'waiting_start' }))
    }
  }, [])

  const sendAnswer = useCallback((questionIndex, answer) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'answer', question_index: questionIndex, answer }))
      setGameState(s => ({ ...s, myAnswer: answer }))
    }
  }, [])

  const sendPing = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'ping' }))
    }
  }, [])

  return { gameState, sendAnswer, sendReady, sendPing, isConnected }
}

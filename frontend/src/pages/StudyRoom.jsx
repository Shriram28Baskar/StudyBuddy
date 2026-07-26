import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useCallback, useRef, useState, useEffect, lazy, Suspense } from 'react'
import { useStudyRoom } from '@/hooks/useStudyRoom'
import { useVoiceChat } from '@/hooks/useVoiceChat'
import Whiteboard     from '@/components/room/Whiteboard'
import ChatPanel      from '@/components/room/ChatPanel'
import TimerPanel     from '@/components/room/TimerPanel'
import ParticipantBar from '@/components/room/ParticipantBar'
import VoiceControls  from '@/components/room/VoiceControls'
import { studyRoomsAPI } from '../services/api'

// Lazy-load PdfViewer to avoid loading pdfjs-dist upfront
const PdfViewer = lazy(() => import('@/components/room/PdfViewer'))

// ---------------------------------------------------------------------------
// Cursor throttle helper
// ---------------------------------------------------------------------------

function useThrottle(fn, delay) {
  const lastCall = useRef(0)
  return useCallback((...args) => {
    const now = Date.now()
    if (now - lastCall.current >= delay) {
      lastCall.current = now
      fn(...args)
    }
  }, [fn, delay])
}

// ---------------------------------------------------------------------------
// StudyRoom page
// ---------------------------------------------------------------------------

export default function StudyRoom() {
  const { roomId }                = useParams()
  const [searchParams]            = useSearchParams()
  const userId                    = searchParams.get('userId') || ''
  const navigate                  = useNavigate()

  const { room, send, isConnected, setSignalingHandler } = useStudyRoom(roomId, userId)

  // Find current user's participant record
  const myParticipant = room.participants.find(p => p.user_id === userId)
  const myColor       = myParticipant?.color || '#9b6dff'
  const isHost        = room.participants.length > 0 && room.participants[0]?.user_id === userId

  // Voice chat state
  const [voiceEnabled, setVoiceEnabled] = useState(false)

  const {
    voiceStatus,
    isMuted,
    micPermission,
    speakingUsers: voiceSpeakingUsers,
    joinVoice,
    leaveVoice,
    toggleMute,
    handleSignaling,
  } = useVoiceChat(userId, room.participants, send, voiceEnabled)

  // Register signaling handler with the WS hook
  useEffect(() => {
    setSignalingHandler(handleSignaling)
    return () => setSignalingHandler(null)
  }, [setSignalingHandler, handleSignaling])

  // Merge speaking users from voice hook and WS room state
  const speakingUsers = { ...room.speakingUsers, ...voiceSpeakingUsers }

  // PDF document state
  const hasPdf        = !!room.document
  const currentPage   = room.document?.current_page ?? 1
  const totalPages    = room.document?.total_pages ?? 1
  const pdfUrl        = hasPdf ? `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/study-rooms/${roomId}/document` : null

  // Container width for PDF rendering
  const mainContentRef = useRef(null)
  const [contentWidth, setContentWidth] = useState(800)

  useEffect(() => {
    if (!mainContentRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContentWidth(Math.floor(entry.contentRect.width))
      }
    })
    observer.observe(mainContentRef.current)
    return () => observer.disconnect()
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleDraw = useCallback((event) => {
    send(event)
  }, [send])

  const handleChat = useCallback((message) => {
    send({ type: 'chat', message, user_name: myParticipant?.name || 'Anonymous' })
  }, [send, myParticipant])

  const handleTimerStart = useCallback((durationMinutes) => {
    send({ type: 'timer_start', duration_minutes: durationMinutes })
  }, [send])

  const handleTimerPause = useCallback(() => {
    send({ type: 'timer_pause' })
  }, [send])

  const handleTimerReset = useCallback(() => {
    send({ type: 'timer_reset' })
  }, [send])

  // Cursor movement – throttled to 50 ms
  const handleCursorMoveRaw = useCallback(({ x, y }) => {
    send({ type: 'cursor', x, y })
  }, [send])

  const handleCursorMove = useThrottle(handleCursorMoveRaw, 50)

  // ── PDF handlers ───────────────────────────────────────────────────────────

  const handleUploadPdf = useCallback(async (file) => {
    if (!file || !isHost) return
    try {
      await studyRoomsAPI.uploadDocument(roomId, userId, file)
    } catch (err) {
      alert(`Upload failed: ${err.message}`)
    }
  }, [roomId, userId, isHost])

  const handlePageChange = useCallback((page) => {
    send({ type: 'page_change', page })
  }, [send])

  // ── Voice handlers ─────────────────────────────────────────────────────────

  const handleJoinVoice = useCallback(async () => {
    setVoiceEnabled(true)
    await joinVoice()
  }, [joinVoice])

  const handleLeaveVoice = useCallback(() => {
    setVoiceEnabled(false)
    leaveVoice()
  }, [leaveVoice])

  // ── Leave room ─────────────────────────────────────────────────────────────
  const handleLeave = useCallback(() => {
    // Clean up voice before leaving
    if (voiceEnabled) leaveVoice()
    navigate('/study-rooms')
  }, [navigate, voiceEnabled, leaveVoice])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 64px)',   // subtract TopBar height
      minHeight: 0,
      background: '#0a0a0e',
      overflow: 'hidden',
    }}>
      {/* ── Participant bar (full width, top) ──────────────────────────── */}
      <ParticipantBar
        participants={room.participants}
        myUserId={userId}
        roomName={room.room_name}
        subject={room.subject}
        joinCode={room.join_code}
        isConnected={isConnected}
        isHost={isHost}
        document={room.document}
        onUploadPdf={handleUploadPdf}
        speakingUsers={speakingUsers}
      />

      {/* Voice + Leave button row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        background: '#0d0b12',
        borderBottom: '1px solid #1e1e2a',
        flexShrink: 0,
      }}>
        {/* Voice controls (left side) */}
        <VoiceControls
          voiceStatus={voiceStatus}
          isMuted={isMuted}
          micPermission={micPermission}
          onJoinVoice={handleJoinVoice}
          onLeaveVoice={handleLeaveVoice}
          onToggleMute={toggleMute}
        />

        {/* Leave button (right side) */}
        <button
          onClick={handleLeave}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: '1px solid #3a1a1a',
            background: '#2a0a0a',
            color: '#ff8080',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ← Leave Room
        </button>
      </div>

      {/* ── Main body: Whiteboard (+ PDF) | Right panel ─────────────────── */}
      <div style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        gap: 0,
      }}>
        {/* Main content area – PDF + Whiteboard overlay */}
        <div
          ref={mainContentRef}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {hasPdf ? (
            <>
              {/* PDF viewer layer (bottom) */}
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 1,
                overflow: 'hidden',
              }}>
                <Suspense fallback={
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#666',
                    fontSize: 14,
                  }}>
                    Loading PDF viewer…
                  </div>
                }>
                  <PdfViewer
                    pdfUrl={pdfUrl}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    isHost={isHost}
                    onPageChange={handlePageChange}
                    containerWidth={contentWidth}
                  />
                </Suspense>
              </div>

              {/* Whiteboard overlay (on top of PDF) */}
              <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none',
              }}>
                <Whiteboard
                  events={room.whiteboard}
                  onDraw={handleDraw}
                  userId={userId}
                  myColor={myColor}
                  cursors={room.cursors}
                  onCursorMove={handleCursorMove}
                  hasPdf={true}
                />
              </div>
            </>
          ) : (
            /* Standard whiteboard (no PDF) */
            <Whiteboard
              events={room.whiteboard}
              onDraw={handleDraw}
              userId={userId}
              myColor={myColor}
              cursors={room.cursors}
              onCursorMove={handleCursorMove}
              hasPdf={false}
            />
          )}
        </div>

        {/* Right panel: Chat (top) + Timer (bottom) */}
        <div style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          borderLeft: '1px solid #1e1e2a',
          background: '#0d0b12',
          minHeight: 0,
        }}>
          {/* Chat panel – grows to fill available space */}
          <div style={{ flex: 1, minHeight: 0, padding: '10px 10px 5px' }}>
            <ChatPanel
              messages={room.chatMessages}
              onSend={handleChat}
              myUserId={userId}
              participants={room.participants}
            />
          </div>

          {/* Timer panel – fixed height at bottom */}
          <div style={{ padding: '5px 10px 10px', flexShrink: 0 }}>
            <TimerPanel
              timer={room.timer}
              onTimerStart={handleTimerStart}
              onTimerPause={handleTimerPause}
              onTimerReset={handleTimerReset}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

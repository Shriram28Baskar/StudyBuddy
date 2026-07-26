import { useState, useRef, useEffect, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function getParticipantColor(userId, participants) {
  const p = participants?.find(p => p.user_id === userId)
  return p?.color || '#9b6dff'
}

// ---------------------------------------------------------------------------
// Chat message bubble
// ---------------------------------------------------------------------------

function ChatMessage({ msg, isMe, participants }) {
  const color = msg.color || getParticipantColor(msg.user_id, participants)
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isMe ? 'flex-end' : 'flex-start',
      gap: 2,
      marginBottom: 10,
    }}>
      {/* Author + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isMe && (
          <div style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#000',
            flexShrink: 0,
          }}>
            {(msg.user_name || '?')[0].toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 11, color: isMe ? '#9b6dff' : color, fontWeight: 600 }}>
          {isMe ? 'You' : msg.user_name}
        </span>
        <span style={{ fontSize: 10, color: '#444' }}>
          {formatTimestamp(msg.timestamp)}
        </span>
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '85%',
        padding: '7px 12px',
        borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isMe ? '#1a1428' : '#1e1e2a',
        border: `1px solid ${isMe ? '#3a2a5a' : '#2a2a3a'}`,
        color: '#e8e4f0',
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {msg.message}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

/**
 * @param {object}   props
 * @param {Array}    props.messages      - Chat message objects from room state
 * @param {Function} props.onSend        - Called with message string
 * @param {string}   props.myUserId
 * @param {Array}    props.participants  - Participant list for colour lookup
 */
export default function ChatPanel({ messages = [], onSend, myUserId, participants = [] }) {
  const [text, setText]     = useState('')
  const bottomRef           = useRef(null)
  const inputRef            = useRef(null)

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
    inputRef.current?.focus()
  }, [text, onSend])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid #1e1e2a',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 15 }}>💬</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e8e4f0' }}>Room Chat</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#555' }}>
          {messages.length} msg{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '12px 12px 4px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#2a2a3a transparent',
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 12, marginTop: 40 }}>
            No messages yet.<br />Say hi! 👋
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage
              key={`${msg.timestamp}-${i}`}
              msg={msg}
              isMe={msg.user_id === myUserId}
              participants={participants}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 10px',
        borderTop: '1px solid #1e1e2a',
        display: 'flex',
        gap: 8,
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          maxLength={500}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #2a2a3a',
            background: '#0a0a0e',
            color: '#e8e4f0',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: 'none',
            background: text.trim() ? '#9b6dff' : '#1e1e2a',
            color: text.trim() ? '#fff' : '#555',
            fontWeight: 700,
            fontSize: 13,
            cursor: text.trim() ? 'pointer' : 'default',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

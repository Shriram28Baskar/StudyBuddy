import { useState, useRef, useEffect } from 'react'

export default function ChatInput({
  onSend,
  loading = false,
  placeholder = 'Ask a question...',
  disabled = false,
}) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  // Auto-resize textarea height as user types
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [value])

  // Focus input on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleKeyDown(e) {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleSend() {
    const trimmed = value.trim()
    if (!trimmed || loading || disabled) return
    onSend(trimmed)
    setValue('')
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const isEmpty = value.trim().length === 0
  const isDisabled = loading || disabled || isEmpty

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 10,
      background: '#14121a',
      border: '1px solid #2a2a38',
      borderRadius: 12,
      padding: '10px 12px',
      transition: 'border-color 0.15s',
    }}
      onFocus={e => e.currentTarget.style.borderColor = '#5c35aa'}
      onBlur={e  => e.currentTarget.style.borderColor = '#2a2a38'}
    >
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={loading || disabled}
        rows={1}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          color: '#ddd',
          fontSize: 14,
          lineHeight: 1.6,
          fontFamily: '"DM Sans", system-ui, sans-serif',
          padding: 0,
          overflowY: 'hidden',
          maxHeight: 160,
          opacity: disabled ? 0.5 : 1,
        }}
      />

      {/* Hint + Send button row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {/* Keyboard hint */}
        {!loading && (
          <span style={{ fontSize: 11, color: '#444', userSelect: 'none', whiteSpace: 'nowrap' }}>
            ↵ send
          </span>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isDisabled}
          title="Send message (Enter)"
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            border: 'none',
            background: isDisabled ? '#1e1e2a' : '#5c35aa',
            color: isDisabled ? '#444' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s, transform 0.1s',
            flexShrink: 0,
          }}
          onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = '#7c4dff' }}
          onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.background = '#5c35aa' }}
          onMouseDown={e  => { if (!isDisabled) e.currentTarget.style.transform = 'scale(0.94)' }}
          onMouseUp={e    => { if (!isDisabled) e.currentTarget.style.transform = 'scale(1)' }}
        >
          {loading ? <ThinkingDots /> : <SendIcon />}
        </button>
      </div>
    </div>
  )
}

// ── Send arrow icon ───────────────────────────────────────────────────
function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2"  x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

// ── Animated thinking dots ────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#9b6dff',
            display: 'inline-block',
            animation: 'dotBounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes dotBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
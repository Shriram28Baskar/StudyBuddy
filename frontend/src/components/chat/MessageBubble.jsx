import { useState } from 'react'

/**
 * MessageBubble
 *
 * Props:
 *   role      — 'user' | 'assistant'
 *   content   — string (supports newlines; AI messages render markdown-lite)
 *   timestamp — Date | string | null
 *   isLatest  — bool (shows typing indicator instead of content when true + loading)
 *   loading   — bool (used with isLatest to show typing animation)
 */
export default function MessageBubble({
  role,
  content,
  timestamp = null,
  isLatest  = false,
  loading   = false,
}) {
  const isUser = role === 'user'

  // Show typing animation only on the latest AI message while loading
  if (!isUser && isLatest && loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, maxWidth: '80%' }}>
          <Avatar role="assistant" />
          <TypingBubble />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        animation: 'bubbleFadeIn 0.18s ease-out',
      }}
    >
      <style>{`
        @keyframes bubbleFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        maxWidth: '80%',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {/* Avatar */}
        <Avatar role={role} />

        {/* Bubble */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
          <BubbleBody role={role} content={content} />
          {timestamp && <Timestamp value={timestamp} align={isUser ? 'right' : 'left'} />}
        </div>
      </div>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────
function Avatar({ role }) {
  const isUser = role === 'user'
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
      background: isUser ? '#2a1f40' : '#14121a',
      border: `1px solid ${isUser ? '#3d2060' : '#1e1e2a'}`,
      color: isUser ? '#9b6dff' : '#5bbdff',
    }}>
      {isUser ? 'U' : 'AI'}
    </div>
  )
}

// ── Bubble body ───────────────────────────────────────────────────────
function BubbleBody({ role, content }) {
  const isUser = role === 'user'
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ position: 'relative' }} className="group">
      <div style={{
        padding: '10px 14px',
        borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
        background: isUser ? '#2a1f40' : '#14121a',
        border: `1px solid ${isUser ? '#3d2060' : '#1e1e2a'}`,
        color: '#ddd',
        fontSize: 14,
        lineHeight: 1.7,
        maxWidth: '100%',
        wordBreak: 'break-word',
      }}>
        {isUser ? (
          // User messages: plain text with newline support
          <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
        ) : (
          // AI messages: lightweight markdown rendering
          <MarkdownLite content={content} />
        )}
      </div>

      {/* Copy button — shown on hover for AI messages */}
      {!isUser && (
        <button
          onClick={handleCopy}
          title="Copy to clipboard"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            background: '#1e1e2a',
            border: '1px solid #2a2a38',
            borderRadius: 5,
            padding: '2px 6px',
            color: copied ? '#5bff9b' : '#555',
            fontSize: 10,
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 0.15s, color 0.15s',
            lineHeight: 1.4,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.color = copied ? '#5bff9b' : '#9b6dff'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '0'
            e.currentTarget.style.color = copied ? '#5bff9b' : '#555'
          }}
          // Keep visible while focused
          onFocus={e  => e.currentTarget.style.opacity = '1'}
          onBlur={e   => e.currentTarget.style.opacity = '0'}
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      )}
    </div>
  )
}

// ── Timestamp ─────────────────────────────────────────────────────────
function Timestamp({ value, align }) {
  const label = formatTime(value)
  return (
    <span style={{
      fontSize: 10,
      color: '#444',
      textAlign: align,
      paddingLeft: align === 'left' ? 4 : 0,
      paddingRight: align === 'right' ? 4 : 0,
    }}>
      {label}
    </span>
  )
}

function formatTime(value) {
  try {
    const d = value instanceof Date ? value : new Date(value)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ── Typing bubble ─────────────────────────────────────────────────────
function TypingBubble() {
  return (
    <div style={{
      padding: '12px 16px',
      borderRadius: '2px 12px 12px 12px',
      background: '#14121a',
      border: '1px solid #1e1e2a',
      display: 'flex',
      alignItems: 'center',
      gap: 5,
    }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#9b6dff',
          display: 'inline-block',
          opacity: 0.4,
          animation: 'typingDot 1.3s ease-in-out infinite',
          animationDelay: `${i * 0.18}s`,
        }} />
      ))}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0);    opacity: 0.35; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Lightweight markdown renderer ─────────────────────────────────────
// Handles: bold, inline code, code blocks, numbered lists, bullet lists,
// headers (##), and plain paragraphs with newlines.
function MarkdownLite({ content }) {
  if (!content) return null

  const lines    = content.split('\n')
  const elements = []
  let i          = 0
  let keyCounter = 0
  const key      = () => keyCounter++

  while (i < lines.length) {
    const line = lines[i]

    // ── Fenced code block (``` ... ```) ─────────────────────────────
    if (line.startsWith('```')) {
      const lang   = line.slice(3).trim()
      const codeLines = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      elements.push(
        <CodeBlock key={key()} code={codeLines.join('\n')} lang={lang} />
      )
      i++
      continue
    }

    // ── Heading ## ───────────────────────────────────────────────────
    if (line.startsWith('## ')) {
      elements.push(
        <div key={key()} style={{ fontSize: 15, fontWeight: 600, color: '#e8e4f0', margin: '12px 0 4px' }}>
          {inlineFormat(line.slice(3))}
        </div>
      )
      i++
      continue
    }

    // ── Heading # ────────────────────────────────────────────────────
    if (line.startsWith('# ')) {
      elements.push(
        <div key={key()} style={{ fontSize: 17, fontWeight: 600, color: '#e8e4f0', margin: '14px 0 6px' }}>
          {inlineFormat(line.slice(2))}
        </div>
      )
      i++
      continue
    }

    // ── Numbered list ────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={key()} style={{ paddingLeft: 20, margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ color: '#ddd', fontSize: 14, lineHeight: 1.6 }}>
              {inlineFormat(item)}
            </li>
          ))}
        </ol>
      )
      continue
    }

    // ── Bullet list (-, *, •) ────────────────────────────────────────
    if (/^[-*•]\s/.test(line)) {
      const items = []
      while (i < lines.length && /^[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•]\s/, ''))
        i++
      }
      elements.push(
        <ul key={key()} style={{ paddingLeft: 0, margin: '6px 0', display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none' }}>
          {items.map((item, idx) => (
            <li key={idx} style={{ color: '#ddd', fontSize: 14, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: '#9b6dff', flexShrink: 0, marginTop: 2 }}>·</span>
              <span>{inlineFormat(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    // ── Horizontal rule ──────────────────────────────────────────────
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(
        <hr key={key()} style={{ border: 'none', borderTop: '1px solid #1e1e2a', margin: '10px 0' }} />
      )
      i++
      continue
    }

    // ── Empty line → spacing ─────────────────────────────────────────
    if (line.trim() === '') {
      if (elements.length > 0) {
        elements.push(<div key={key()} style={{ height: 6 }} />)
      }
      i++
      continue
    }

    // ── Plain paragraph ──────────────────────────────────────────────
    elements.push(
      <p key={key()} style={{ margin: 0, color: '#ddd', fontSize: 14, lineHeight: 1.7 }}>
        {inlineFormat(line)}
      </p>
    )
    i++
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{elements}</div>
}

// ── Inline formatting: **bold**, `code`, *italic* ─────────────────────
function inlineFormat(text) {
  // Split on bold (**...**), inline code (`...`), italic (*...*)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#e8e4f0', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} style={{
          background: '#0f0f13',
          border: '1px solid #2a2a38',
          borderRadius: 4,
          padding: '1px 5px',
          fontSize: 12,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          color: '#c4a8ff',
        }}>
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} style={{ color: '#bbb' }}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

// ── Code block with copy button ───────────────────────────────────────
function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: '#0a0a0e',
      border: '1px solid #1e1e2a',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '8px 0',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: '#14121a',
        borderBottom: '1px solid #1e1e2a',
      }}>
        <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
          {lang || 'code'}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#5bff9b' : '#555',
            fontSize: 11,
            cursor: 'pointer',
            padding: '2px 4px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => { if (!copied) e.currentTarget.style.color = '#9b6dff' }}
          onMouseLeave={e => { if (!copied) e.currentTarget.style.color = '#555' }}
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>

      {/* Code content */}
      <pre style={{
        margin: 0,
        padding: '12px 14px',
        overflowX: 'auto',
        fontSize: 12,
        lineHeight: 1.65,
        color: '#c4a8ff',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        whiteSpace: 'pre',
      }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}
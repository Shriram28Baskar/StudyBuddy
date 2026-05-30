import { useState, useRef, useEffect, useCallback } from 'react'
import useAppStore from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const SUBJECTS = [
  'General',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'History',
  'Geography',
  'English',
  'Economics',
  'Political Science',
  'Philosophy',
  'Machine Learning',
  'Data Structures & Algorithms',
]

// Predefined topics for quick selection
const QUICK_QUESTIONS = [
  "Explain Newton's second law with an example",
  "What is the difference between RAM and ROM?",
  "How does photosynthesis work?",
  "Explain the concept of derivatives in calculus",
  "What caused World War I?",
  "How does gradient descent work in ML?",
]

export default function Chat() {
  const [subject, setSubject] = useState('General')
  const [topic, setTopic] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(scrollToBottom, [messages])

  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim()) return

    // Add user message to UI
    const newMessages = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      // Call backend chat endpoint
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          subject,
          topic: topic || undefined,
          history: newMessages.slice(-10), // send last 10 messages for context
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error: ${res.status}`)
      }

      const data = await res.json()
      // Add assistant response to UI
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      console.error('Chat error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [subject, topic, messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleQuickQuestion = (q) => {
    sendMessage(q)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .message-user {
          animation: fadeIn 0.2s ease-out;
        }
        .message-assistant {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>

      {/* Context Panel */}
      <div style={{
        background: '#14121a',
        border: '1px solid #1e1e2a',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        alignItems: 'flex-end',
      }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
            Subject
          </label>
          <select
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '8px 12px', color: '#ccc', fontSize: 13, cursor: 'pointer', outline: 'none' }}
          >
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
            Topic (optional)
          </label>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="e.g., Thermodynamics"
            style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '8px 12px', color: '#ccc', fontSize: 13 }}
          />
        </div>
      </div>

      {/* Quick Questions */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {QUICK_QUESTIONS.map((q, i) => (
          <button
            key={i}
            onClick={() => handleQuickQuestion(q)}
            style={{
              background: '#0f0f13',
              border: '1px solid #2a2a38',
              borderRadius: 20,
              padding: '5px 12px',
              fontSize: 11,
              color: '#888',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#888' }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      {messages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            onClick={() => { setMessages([]); setError(null) }}
            style={{
              background: 'none',
              border: '1px solid #2a2a38',
              borderRadius: 7,
              padding: '4px 12px',
              color: '#555',
              fontSize: 11,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff5b5b'; e.currentTarget.style.color = '#ff5b5b' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#555' }}
          >
            🗑 Clear chat
          </button>
        </div>
      )}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#0f0f13',
        borderRadius: 12,
        padding: '20px',
        marginBottom: 16,
        border: '1px solid #1e1e2a',
      }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#555', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14 }}>Hi! I'm your AI tutor. I'm ready to help with <strong>{subject}</strong>.</div>
            <div style={{ fontSize: 13, marginTop: 8 }}>What would you like to know?</div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={msg.role === 'user' ? 'message-user' : 'message-assistant'}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  background: msg.role === 'user' ? '#5c35aa' : '#14121a',
                  borderRadius: 18,
                  padding: '10px 16px',
                  color: msg.role === 'user' ? '#fff' : '#ddd',
                  fontSize: 14,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
            <div style={{ background: '#14121a', borderRadius: 18, padding: '10px 16px' }}>
              <Spinner size="sm" />
            </div>
          </div>
        )}
        {error && (
          <div style={{ background: '#2a0d0d', border: '1px solid #4d1515', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
            <span style={{ color: '#ff9b5b', fontSize: 12 }}>⚠ {error}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your question..."
          disabled={loading}
          style={{
            flex: 1,
            background: '#0f0f13',
            border: '1px solid #2a2a38',
            borderRadius: 24,
            padding: '12px 18px',
            color: '#ccc',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <Button type="submit" variant="primary" disabled={loading || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
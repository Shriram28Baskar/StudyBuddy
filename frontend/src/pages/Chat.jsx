import { useState, useRef, useEffect, useCallback } from 'react'
import MathMarkdown from '@/components/MathMarkdown'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const QUICK_QUESTIONS = [
  "Explain Newton's second law with an example",
  "What is the difference between RAM and ROM?",
  "How does photosynthesis work?",
  "Explain the concept of derivatives in calculus",
  "What caused World War I?",
  "How does gradient descent work in ML?",
]

const ACCEPTED_FORMATS = '.pdf,.txt,.md,.docx,.pptx,.csv,.xlsx,.xls,.json,.png,.jpg,.jpeg'
const MAX_FILE_MB = 10

// ── Visual query detection ────────────────────────────────────────────────────
const VISUAL_KEYWORDS = [
  'show me', 'diagram', 'how does', 'what does', 'illustrate', 'picture',
  'image', 'look like', 'draw', 'visualize', 'visualise', 'architecture',
  'structure', 'binary tree', 'linked list', 'neural network', 'flowchart',
  'show the', 'show a', 'what is a', 'how is a', 'how do', 'graph of',
  'example of', 'quick sort', 'merge sort', 'bubble sort', 'cnn', 'rnn',
  'circuit', 'topology', 'algorithm steps', 'data structure',
]

function isVisualQuery(msg) {
  const lower = msg.toLowerCase()
  return VISUAL_KEYWORDS.some(kw => lower.includes(kw))
}

// ── LocalStorage helpers for chat history ─────────────────────────────────────
const HISTORY_KEY = 'studybuddy_chat_history'
const MAX_SESSIONS = 30

function loadSessions() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSessions(sessions) {
  try {
    // Keep only the latest MAX_SESSIONS
    const trimmed = sessions.slice(0, MAX_SESSIONS)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch { /* quota exceeded — silently fail */ }
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const markdownStyles = `
  .md-body p { margin: 0 0 8px 0; line-height: 1.6; }
  .md-body p:last-child { margin-bottom: 0; }
  .md-body ul, .md-body ol { margin: 6px 0 8px 0; padding-left: 20px; }
  .md-body li { margin-bottom: 4px; line-height: 1.5; }
  .md-body strong { color: #fff; font-weight: 600; }
  .md-body em { color: #c9b8ff; font-style: italic; }
  .md-body code {
    background: #0a0a10;
    border: 1px solid #2a2a38;
    border-radius: 4px;
    padding: 1px 6px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #a78bfa;
  }
  .md-body pre {
    background: #0a0a10;
    border: 1px solid #2a2a38;
    border-radius: 8px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 8px 0;
  }
  .md-body pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 12.5px;
    color: #ccc;
  }
  .md-body h1, .md-body h2, .md-body h3 {
    color: #e2d9ff;
    margin: 10px 0 6px 0;
    font-weight: 600;
  }
  .md-body h1 { font-size: 17px; }
  .md-body h2 { font-size: 15px; }
  .md-body h3 { font-size: 14px; }
  .md-body blockquote {
    border-left: 3px solid #5c35aa;
    margin: 8px 0;
    padding: 4px 12px;
    color: #aaa;
    font-style: italic;
  }
  .md-body hr { border: none; border-top: 1px solid #2a2a38; margin: 10px 0; }
  .md-body table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 13px; }
  .md-body th { background: #1a1826; color: #c9b8ff; padding: 6px 10px; border: 1px solid #2a2a38; text-align: left; }
  .md-body td { padding: 6px 10px; border: 1px solid #2a2a38; color: #ccc; }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-16px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .message-user      { animation: fadeIn 0.2s ease-out; }
  .message-assistant { animation: fadeIn 0.3s ease-out; }
  .uploading-pulse   { animation: pulse 1.5s ease-in-out infinite; }
  .history-panel     { animation: slideIn 0.2s ease-out; }

  .source-item {
    font-size: 11px;
    color: #666;
    padding: 4px 8px;
    background: #0a0a10;
    border-radius: 4px;
    border-left: 2px solid #3d2060;
    line-height: 1.4;
    cursor: default;
  }
  .visual-img {
    border-radius: 8px;
    max-width: 100%;
    max-height: 200px;
    object-fit: cover;
    border: 1px solid #2a2a38;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }
  .visual-img:hover {
    transform: scale(1.02);
    border-color: #9b6dff;
  }

  .history-entry {
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
  }
  .history-entry:hover {
    background: #1a1428;
    border-color: #2a2a38;
  }
  .history-entry-active {
    background: #1a1428 !important;
    border-color: #5c35aa !important;
  }

  .doc-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d1a0f;
    border: 1px solid #1a4d2a;
    border-radius: 16px;
    padding: 3px 10px 3px 8px;
    font-size: 11px;
    color: #5bff9b;
    max-width: 200px;
    animation: fadeIn 0.2s ease-out;
  }
  .doc-chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .doc-chip-remove {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 12px;
    padding: 0;
    line-height: 1;
    transition: color 0.15s;
    flex-shrink: 0;
  }
  .doc-chip-remove:hover { color: #ff5b5b; }
`

// ── Source collapse component ─────────────────────────────────────────────────
function SourcesPanel({ sources }) {
  const [open, setOpen] = useState(false)
  if (!sources || sources.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', color: '#555', fontSize: 11,
          cursor: 'pointer', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>📄 {sources.length} source{sources.length > 1 ? 's' : ''} from document</span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {sources.map((s, i) => (
            <div key={i} className="source-item">{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Visual images component ───────────────────────────────────────────────────
function VisualImages({ images }) {
  const [failedSrcs, setFailedSrcs] = useState(new Set())
  if (!images || images.length === 0) return null

  const visibleImages = images.filter(img => !failedSrcs.has(img.url))
  if (visibleImages.length === 0) return null

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>🖼 Related diagrams</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visibleImages.map((img, i) => (
          <div key={i} style={{ flex: '1 1 140px', maxWidth: 200 }}>
            <img
              src={img.url}
              alt={img.title || 'Educational diagram'}
              className="visual-img"
              loading="lazy"
              onError={() => setFailedSrcs(prev => new Set([...prev, img.url]))}
              onClick={() => window.open(img.url, '_blank')}
            />
            {img.title && (
              <div style={{ fontSize: 10, color: '#555', marginTop: 3, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {img.title}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Past Chats History Panel ──────────────────────────────────────────────────
function HistoryPanel({ sessions, activeSessionId, onSelect, onDelete, onClose }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="history-panel" style={{
        width: 280, background: '#0c0b12', borderRight: '1px solid #1e1e2a',
        padding: 16, display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#c9b8ff' }}>Past Chats</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#444', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
            No past chats yet.<br />Start a conversation!
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="history-panel" style={{
      width: 280, background: '#0c0b12', borderRight: '1px solid #1e1e2a',
      padding: 16, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#c9b8ff' }}>Past Chats</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const firstUserMsg = session.messages?.find(m => m.role === 'user')
          const preview = firstUserMsg
            ? (firstUserMsg.content.length > 55 ? firstUserMsg.content.slice(0, 55) + '…' : firstUserMsg.content)
            : 'Empty chat'
          const time = new Date(session.timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })

          return (
            <div
              key={session.id}
              className={`history-entry ${isActive ? 'history-entry-active' : ''}`}
              onClick={() => onSelect(session)}
            >
              <div style={{ fontSize: 10, color: '#555', marginBottom: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{time}</span>
                <button
                  className="doc-chip-remove"
                  onClick={(e) => { e.stopPropagation(); onDelete(session.id) }}
                  title="Delete this chat"
                  style={{ fontSize: 10, padding: '0 2px' }}
                >
                  🗑
                </button>
              </div>
              <div style={{ fontSize: 12, color: isActive ? '#c9b8ff' : '#888', lineHeight: 1.4 }}>
                {preview}
              </div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                {session.messages?.filter(m => m.role !== 'system').length || 0} messages
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ── Main Chat component ───────────────────────────────────────────────────────
export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Session state
  const [sessionId, setSessionId] = useState(() => generateSessionId())
  const [sessions, setSessions]   = useState(() => loadSessions())
  const [showHistory, setShowHistory] = useState(false)

  // Multi-document upload state
  const [uploadedDocs, setUploadedDocs]   = useState([])   // Array of {doc_id, filename, chunk_count}
  const [uploadStatus, setUploadStatus]   = useState('idle') // 'idle' | 'uploading' | 'error'
  const [uploadError, setUploadError]     = useState(null)
  const [uploadQueue, setUploadQueue]     = useState(0)      // Number of files currently uploading

  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  const fileInputRef   = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Save current session to history ─────────────────────────────────────────
  const saveCurrentSession = useCallback(() => {
    if (messages.length === 0) return

    const userMsgs = messages.filter(m => m.role !== 'system')
    if (userMsgs.length === 0) return

    const session = {
      id: sessionId,
      timestamp: Date.now(),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        // Don't persist images/sources — too large for localStorage
      })),
    }

    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId)
      const updated = [session, ...filtered]
      saveSessions(updated)
      return updated
    })
  }, [messages, sessionId])

  // Auto-save on every message change (debounced by React batching)
  useEffect(() => {
    if (messages.length > 0) {
      saveCurrentSession()
    }
  }, [messages, saveCurrentSession])

  // ── File upload handler ─────────────────────────────────────────────────────
  const handleFileUpload = useCallback(async (file) => {
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['pdf', 'txt', 'md', 'docx', 'pptx', 'csv', 'xlsx', 'xls', 'json', 'png', 'jpg', 'jpeg']
    if (!allowed.includes(ext)) {
      setUploadError(`Unsupported file type '.${ext}'. Allowed: ${allowed.join(', ')}`)
      setUploadStatus('error')
      return
    }

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_MB} MB.`)
      setUploadStatus('error')
      return
    }

    setUploadQueue(q => q + 1)
    setUploadStatus('uploading')
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_BASE}/chat/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Upload failed (${res.status})`)
      }

      const data = await res.json()

      setUploadedDocs(prev => [...prev, data])

      // Add a system message to the chat
      setMessages(prev => [...prev, {
        role: 'system',
        content: `📎 **${data.filename}** uploaded — ${data.chunk_count} sections indexed.`,
      }])
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.')
      setUploadStatus('error')
    } finally {
      setUploadQueue(q => {
        const newQ = q - 1
        if (newQ <= 0) {
          setUploadStatus(prev => prev === 'error' ? 'error' : 'idle')
        }
        return Math.max(0, newQ)
      })
    }
  }, [])

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    files.forEach(file => handleFileUpload(file))
    // Reset so the same files can be re-uploaded if needed
    e.target.value = ''
  }

  const removeDocument = (docId) => {
    setUploadedDocs(prev => prev.filter(d => d.doc_id !== docId))
    if (uploadedDocs.length <= 1) {
      setUploadStatus('idle')
    }
  }

  const clearAllDocuments = () => {
    setUploadedDocs([])
    setUploadStatus('idle')
    setUploadError(null)
  }

  // ── History handlers ────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    saveCurrentSession()
    setMessages([])
    setError(null)
    setSessionId(generateSessionId())
    setUploadedDocs([])
    setUploadStatus('idle')
    setUploadError(null)
  }, [saveCurrentSession])

  const handleSelectSession = useCallback((session) => {
    // Save current before switching
    saveCurrentSession()
    setSessionId(session.id)
    setMessages(session.messages || [])
    setError(null)
    setUploadedDocs([])
    setUploadStatus('idle')
  }, [saveCurrentSession])

  const handleDeleteSession = useCallback((id) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSessions(updated)
      return updated
    })
    // If we're deleting the active session, start a new one
    if (id === sessionId) {
      handleNewChat()
    }
  }, [sessionId, handleNewChat])

  // ── Message send handler ────────────────────────────────────────────────────
  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim()) return

    const historyBeforeThisMessage = messages
      .filter(m => m.role !== 'system')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }))

    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setInput('')
    setLoading(true)
    setError(null)

    const visual = isVisualQuery(userMessage)
    const hasDocContext = uploadedDocs.length > 0

    try {
      // Fire text answer + (optional) image search concurrently
      const textPromise = hasDocContext
        ? fetch(`${API_BASE}/chat/doc-query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              doc_ids: uploadedDocs.map(d => d.doc_id),
              message: userMessage,
              history: historyBeforeThisMessage,
            }),
          })
        : fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: userMessage,
              subject: 'General',
              history: historyBeforeThisMessage,
            }),
          })

      const imagePromise = visual
        ? fetch(`${API_BASE}/chat/visual-search?q=${encodeURIComponent(userMessage)}`)
            .then(r => r.json())
            .catch(() => ({ images: [] }))
        : Promise.resolve({ images: [] })

      const [textRes, imageData] = await Promise.all([textPromise, imagePromise])

      if (!textRes.ok) {
        const err = await textRes.json().catch(() => ({}))
        throw new Error(err.detail || `Server error: ${textRes.status}`)
      }

      const data = await textRes.json()
      const reply = data.reply ?? data.answer ?? ''
      const sources = data.sources ?? []
      const images = imageData.images ?? []

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        sources,
        images,
      }])
    } catch (err) {
      console.error('Chat error:', err)
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, uploadedDocs])

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input) }
  const handleQuickQuestion = (q) => sendMessage(q)

  // ── Upload status bar ───────────────────────────────────────────────────────
  const renderUploadBar = () => {
    if (uploadStatus === 'error' && uploadError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
          background: '#2a0d0d', border: '1px solid #4d1515',
          borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12,
        }}>
          <span style={{ color: '#ff9b5b' }}>⚠ {uploadError}</span>
          <button onClick={() => { setUploadError(null); setUploadStatus('idle') }} style={{ background: 'none', border: 'none', color: '#ff5b5b', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )
    }

    if (uploadQueue > 0) {
      return (
        <div className="uploading-pulse" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#14121a', border: '1px solid #2a2a38',
          borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#888',
        }}>
          <Spinner size="sm" />
          <span>Processing {uploadQueue} document{uploadQueue > 1 ? 's' : ''}…</span>
        </div>
      )
    }

    return null
  }

  // ── Render uploaded document chips ──────────────────────────────────────────
  const renderDocChips = () => {
    if (uploadedDocs.length === 0) return null

    return (
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12,
        padding: '8px 12px', background: '#0c0b12', borderRadius: 8,
        border: '1px solid #1a4d2a',
      }}>
        <div style={{ fontSize: 10, color: '#5bff9b', width: '100%', marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📎 {uploadedDocs.length} document{uploadedDocs.length > 1 ? 's' : ''} loaded — Document mode active</span>
          {uploadedDocs.length > 1 && (
            <button
              onClick={clearAllDocuments}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 10 }}
              onMouseEnter={e => e.currentTarget.style.color = '#ff5b5b'}
              onMouseLeave={e => e.currentTarget.style.color = '#555'}
            >
              Clear all
            </button>
          )}
        </div>
        {uploadedDocs.map((doc) => (
          <span key={doc.doc_id} className="doc-chip">
            <span>📄</span>
            <span className="doc-chip-name">{doc.filename}</span>
            <span style={{ color: '#3a7d4a', fontSize: 9 }}>({doc.chunk_count})</span>
            <button
              className="doc-chip-remove"
              onClick={() => removeDocument(doc.doc_id)}
              title={`Remove ${doc.filename}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div id="chat-container" style={{ display: 'flex', height: 'calc(100vh - 120px)', maxWidth: 1200, margin: '0 auto' }}>
      <style>{markdownStyles}</style>

      {/* Hidden multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FORMATS}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
        id="chat-file-input"
      />

      {/* History Sidebar */}
      {showHistory && (
        <HistoryPanel
          sessions={sessions}
          activeSessionId={sessionId}
          onSelect={handleSelectSession}
          onDelete={handleDeleteSession}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top action bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 0 12px 0', borderBottom: '1px solid #1e1e2a', marginBottom: 12,
        }}>
          {/* History toggle */}
          <button
            onClick={() => setShowHistory(s => !s)}
            title="Past Chats"
            style={{
              background: showHistory ? '#1a1428' : '#0f0f13',
              border: `1px solid ${showHistory ? '#5c35aa' : '#2a2a38'}`,
              borderRadius: 8, padding: '7px 12px',
              color: showHistory ? '#c9b8ff' : '#666',
              fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!showHistory) { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' } }}
            onMouseLeave={e => { if (!showHistory) { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#666' } }}
          >
            <span style={{ fontSize: 15 }}>🕘</span>
            Past Chats
            {sessions.length > 0 && (
              <span style={{
                background: '#5c35aa', color: '#fff', fontSize: 9, padding: '1px 5px',
                borderRadius: 8, fontWeight: 600, minWidth: 16, textAlign: 'center',
              }}>
                {sessions.length}
              </span>
            )}
          </button>

          {/* New Chat */}
          <button
            onClick={handleNewChat}
            title="New Chat"
            style={{
              background: '#0f0f13', border: '1px solid #2a2a38',
              borderRadius: 8, padding: '7px 12px',
              color: '#666', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#5bff9b'; e.currentTarget.style.color = '#5bff9b' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#666' }}
          >
            <span style={{ fontSize: 15 }}>✨</span>
            New Chat
          </button>

          <div style={{ flex: 1 }} />

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadQueue > 0}
            title="Upload documents (PDF, Word, Images, and more)"
            style={{
              background: uploadedDocs.length > 0 ? '#0d1a0f' : '#0f0f13',
              border: `1px solid ${uploadedDocs.length > 0 ? '#1a4d2a' : '#2a2a38'}`,
              borderRadius: 8, padding: '7px 12px',
              color: uploadedDocs.length > 0 ? '#5bff9b' : '#666',
              fontSize: 13, cursor: uploadQueue > 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (uploadedDocs.length === 0 && uploadQueue === 0) { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' } }}
            onMouseLeave={e => { if (uploadedDocs.length === 0) { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#666' } }}
          >
            <span style={{ fontSize: 15 }}>📎</span>
            {uploadedDocs.length > 0 ? `${uploadedDocs.length} Doc${uploadedDocs.length > 1 ? 's' : ''}` : 'Upload'}
          </button>

          {/* Clear Chat */}
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              style={{
                background: 'none', border: '1px solid #2a2a38', borderRadius: 7,
                padding: '7px 12px', color: '#555', fontSize: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff5b5b'; e.currentTarget.style.color = '#ff5b5b' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#555' }}
            >
              🗑 Clear
            </button>
          )}
        </div>

        {/* Upload status bar */}
        {renderUploadBar()}

        {/* Document chips */}
        {renderDocChips()}

        {/* Quick Questions */}
        {uploadedDocs.length === 0 && messages.length === 0 && (
          <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleQuickQuestion(q)}
                style={{ background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 20, padding: '5px 12px', fontSize: 11, color: '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#888' }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Chat Messages */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#0f0f13', borderRadius: 12, padding: '20px', marginBottom: 16, border: '1px solid #1e1e2a' }}>
          {messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: '40px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 14 }}>Hi! I'm your AI tutor. Ask me <strong>anything</strong>!</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>Upload documents 📎 or ask me any academic question.</div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 6 }}>
                Tip: Ask "Show me how a binary tree works" to get diagrams too.
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              // System messages (document upload notifications)
              if (msg.role === 'system') {
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <div style={{
                      background: '#0d1a0f', border: '1px solid #1a4d2a',
                      borderRadius: 8, padding: '6px 14px',
                      fontSize: 12, color: '#5bff9b', maxWidth: '80%',
                    }}>
                      <div className="md-body">
                        <MathMarkdown content={msg.content} />
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={idx}
                  className={msg.role === 'user' ? 'message-user' : 'message-assistant'}
                  style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 16 }}
                >
                  <div style={{
                    maxWidth: '80%',
                    background: msg.role === 'user' ? '#5c35aa' : '#14121a',
                    borderRadius: 18,
                    padding: '10px 16px',
                    color: msg.role === 'user' ? '#fff' : '#ddd',
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                  }}>
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <>
                        {/* Visual images shown above text */}
                        {msg.images && msg.images.length > 0 && (
                          <VisualImages images={msg.images} />
                        )}
                        <div className="md-body">
                          <MathMarkdown content={msg.content} />
                        </div>
                        </>
                    )}
                  </div>
                </div>
              )
            })
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
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Paperclip upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadQueue > 0}
            title="Upload documents (PDF, Word, Images, and more)"
            style={{
              background: uploadedDocs.length > 0 ? '#0d1a0f' : '#0f0f13',
              border: `1px solid ${uploadedDocs.length > 0 ? '#1a4d2a' : '#2a2a38'}`,
              borderRadius: 12, width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: uploadQueue > 0 ? 'not-allowed' : 'pointer',
              fontSize: 18, flexShrink: 0,
              transition: 'all 0.15s',
              color: uploadedDocs.length > 0 ? '#5bff9b' : '#555',
            }}
            onMouseEnter={e => { if (uploadedDocs.length === 0 && uploadQueue === 0) { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' } }}
            onMouseLeave={e => { if (uploadedDocs.length === 0) { e.currentTarget.style.borderColor = '#2a2a38'; e.currentTarget.style.color = '#555' } }}
          >
            📎
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={uploadedDocs.length > 0 ? `Ask about your ${uploadedDocs.length} document${uploadedDocs.length > 1 ? 's' : ''}…` : 'Type your question…'}
            disabled={loading}
            style={{ flex: 1, background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 24, padding: '12px 18px', color: '#ccc', fontSize: 14, outline: 'none' }}
            id="chat-input"
          />
          <Button type="submit" variant="primary" disabled={loading || !input.trim()} id="chat-send-btn">
            Send
          </Button>
        </form>

        {/* Format hint */}
        <div style={{ fontSize: 10, color: '#333', textAlign: 'center', marginTop: 6 }}>
          📎 Supported: PDF, Word, PowerPoint, CSV, Excel, JSON, Markdown, Text, PNG, JPG · Max {MAX_FILE_MB}MB
        </div>
      </div>
    </div>
  )
}
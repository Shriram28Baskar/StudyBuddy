import { useState, useEffect, useCallback } from 'react'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useTextToSpeech } from '@/hooks/useTextToSpeech'
import MathMarkdown from '@/components/MathMarkdown'
import { voiceSolverAPI } from '../services/api'

const LANGUAGES = [
  { code: 'en-IN', label: 'English',   flag: '🇮🇳' },
  { code: 'ta-IN', label: 'தமிழ்',     flag: '🇮🇳' },
  { code: 'hi-IN', label: 'हिन्दी',    flag: '🇮🇳' },
  { code: 'te-IN', label: 'తెలుగు',    flag: '🇮🇳' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ',     flag: '🇮🇳' },
  { code: 'ml-IN', label: 'മലയാളം',    flag: '🇮🇳' },
]

// ── Pulsing animation style ───────────────────────────────────────────
const pulseKeyframes = `
@keyframes pulse-ring {
  0%   { transform: scale(1);    opacity: 0.8; }
  50%  { transform: scale(1.12); opacity: 0.5; }
  100% { transform: scale(1);    opacity: 0.8; }
}
@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0);   opacity: 0.4; }
  40%           { transform: translateY(-6px); opacity: 1;   }
}
`

// ── Loading dots ──────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#9b6dff', fontWeight: 600, marginRight: 4 }}>Thinking</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#9b6dff',
            animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Key term chip with expand ─────────────────────────────────────────
function KeyTermChip({ term, definition }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'inline-block', position: 'relative', margin: '0 4px 8px' }}>
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          background: open ? 'rgba(155,109,255,0.15)' : '#1e1e2a',
          border: `1px solid ${open ? '#9b6dff' : '#2a2a38'}`,
          borderRadius: 20,
          padding: '5px 14px',
          color: open ? '#9b6dff' : '#c0c0d0',
          fontSize: 12,
          cursor: 'pointer',
          fontWeight: 600,
          transition: 'all 0.2s',
        }}
      >
        {term} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e1e2a',
            border: '1px solid #2a2a38',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12,
            color: '#b0b0c0',
            maxWidth: 280,
            whiteSpace: 'normal',
            lineHeight: 1.6,
            zIndex: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <strong style={{ color: '#9b6dff' }}>{term}:</strong> {definition}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────

export default function VoiceSolver() {
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0])

  const [editedTranscript, setEditedTranscript] = useState('')
  const [answer, setAnswer]             = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)

  const {
    transcript,
    setTranscript,
    isListening,
    startListening,
    stopListening,
    error: speechError,
    supported,
  } = useSpeechRecognition(selectedLang.code)

  const { speak, stop, isSpeaking } = useTextToSpeech()

  // Sync edited transcript when speech recognition updates
  useEffect(() => {
    setEditedTranscript(transcript)
  }, [transcript])

  // ── Submit question ─────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (overrideTranscript) => {
      const text = (overrideTranscript ?? editedTranscript).trim()
      if (!text) { setError('Please speak or type a question first.'); return }

      setError(null)
      setAnswer(null)
      setLoading(true)

      try {
        const { data } = await voiceSolverAPI.solve({ transcript: text, language: selectedLang.label, subject: 'General' })
        setAnswer(data)
      } catch (err) {
        setError(err.message || 'Something went wrong. Please try again.')
      } finally {
        setLoading(false)
      }
    },
    [editedTranscript, selectedLang]
  )

  // Handle follow-up prompt click
  const handleFollowUp = useCallback(
    (question) => {
      setTranscript(question)
      setEditedTranscript(question)
      handleSubmit(question)
    },
    [setTranscript, handleSubmit]
  )

  const micStatus = isListening ? 'Listening...' : loading ? 'Processing...' : 'Tap to speak'

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', color: '#e0e0f0' }}>
      <style>{pulseKeyframes}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          🎙 Voice Doubt Solver
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: '6px 0 0' }}>
          Ask any academic question by voice or text and get a conversational, TTS-ready answer.
        </p>
      </div>

      {/* ── Settings Row ── */}
      <div
        style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {/* Language selector */}
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            Language
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LANGUAGES.map((lang) => {
              const active = lang.code === selectedLang.code
              return (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSelectedLang(lang)
                    if (isListening) stopListening()
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    border: `1px solid ${active ? '#9b6dff' : '#2a2a38'}`,
                    background: active ? 'rgba(155,109,255,0.15)' : 'transparent',
                    color: active ? '#9b6dff' : '#888',
                    fontSize: 12,
                    fontWeight: active ? 700 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {lang.flag} {lang.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Speech API not supported warning ── */}
      {!supported && (
        <div
          style={{
            background: 'rgba(255,219,91,0.1)',
            border: '1px solid rgba(255,219,91,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            color: '#ffdb5b',
            fontSize: 13,
          }}
        >
          ⚠️ Voice input is not supported in this browser. You can still type your question below.
        </div>
      )}

      {/* ── Mic Zone ── */}
      <div
        style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16,
          padding: '40px 24px',
          textAlign: 'center',
          marginBottom: 20,
        }}
      >
        {/* Mic button */}
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            marginBottom: 20,
          }}
        >
          {isListening && (
            <div
              style={{
                position: 'absolute',
                inset: -12,
                borderRadius: '50%',
                border: '2px solid #9b6dff',
                animation: 'pulse-ring 1.2s ease-in-out infinite',
                pointerEvents: 'none',
              }}
            />
          )}
          <button
            onClick={() => {
              if (!supported) return
              if (isListening) {
                stopListening()
              } else {
                setAnswer(null)
                setError(null)
                startListening()
              }
            }}
            disabled={!supported}
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: isListening
                ? 'linear-gradient(135deg, #ff5b5b, #c0392b)'
                : 'linear-gradient(135deg, #7c3aed, #9b6dff)',
              border: 'none',
              cursor: supported ? 'pointer' : 'not-allowed',
              fontSize: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: isListening
                ? '0 0 24px rgba(255,91,91,0.5)'
                : '0 4px 20px rgba(155,109,255,0.4)',
              transition: 'all 0.2s',
              animation: isListening ? 'pulse-ring 1.2s ease-in-out infinite' : 'none',
            }}
          >
            {isListening ? '⏹' : '🎙'}
          </button>
        </div>

        <div style={{ fontSize: 14, color: isListening ? '#ff5b5b' : '#666', fontWeight: isListening ? 700 : 400 }}>
          {micStatus}
        </div>

        {speechError && (
          <div style={{ fontSize: 12, color: '#ff9b5b', marginTop: 8 }}>
            Mic error: {speechError}
          </div>
        )}
      </div>

      {/* ── Transcript Box ── */}
      {(editedTranscript || isListening) && (
        <div
          style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            What you said:
          </div>
          <textarea
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
            placeholder="Your question will appear here. You can also type directly..."
            rows={3}
            style={{
              width: '100%',
              background: '#0d0d14',
              border: '1px solid #2a2a38',
              borderRadius: 8,
              color: '#e0e0f0',
              fontSize: 14,
              padding: '10px 14px',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#9b6dff')}
            onBlur={(e) => (e.target.style.borderColor = '#2a2a38')}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button
              onClick={() => { setEditedTranscript(''); setTranscript(''); setAnswer(null) }}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid #2a2a38',
                borderRadius: 8,
                color: '#666',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !editedTranscript.trim()}
              style={{
                padding: '8px 20px',
                background: loading ? '#333' : 'linear-gradient(135deg, #7c3aed, #9b6dff)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !editedTranscript.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Submitting...' : '✉️ Submit'}
            </button>
          </div>
        </div>
      )}

      {/* ── Or type directly if transcript is empty ── */}
      {!editedTranscript && !isListening && (
        <div
          style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '20px 24px',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
            Or type your question:
          </div>
          <textarea
            value={editedTranscript}
            onChange={(e) => setEditedTranscript(e.target.value)}
            placeholder="e.g. What is a binary search tree? / What is Newton's third law?"
            rows={3}
            style={{
              width: '100%',
              background: '#0d0d14',
              border: '1px solid #2a2a38',
              borderRadius: 8,
              color: '#e0e0f0',
              fontSize: 14,
              padding: '10px 14px',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.6,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#9b6dff')}
            onBlur={(e) => (e.target.style.borderColor = '#2a2a38')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: '#444' }}>Ctrl+Enter to submit</span>
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !editedTranscript.trim()}
              style={{
                padding: '8px 20px',
                background: loading ? '#333' : 'linear-gradient(135deg, #7c3aed, #9b6dff)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !editedTranscript.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Submitting...' : '✉️ Submit'}
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div
          style={{
            background: 'rgba(255,91,91,0.1)',
            border: '1px solid rgba(255,91,91,0.3)',
            color: '#ff5b5b',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div
          style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '28px 24px',
            textAlign: 'center',
            marginBottom: 20,
          }}
        >
          <ThinkingDots />
        </div>
      )}

      {/* ── Answer Card ── */}
      {answer && !loading && (
        <div
          style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Top row: TTS + subject badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() =>
                  isSpeaking
                    ? stop()
                    : speak(answer.answer_short || answer.answer_text, selectedLang.code)
                }
                style={{
                  padding: '8px 16px',
                  background: isSpeaking ? 'rgba(155,109,255,0.15)' : '#1e1e2a',
                  border: `1px solid ${isSpeaking ? '#9b6dff' : '#2a2a38'}`,
                  borderRadius: 8,
                  color: isSpeaking ? '#9b6dff' : '#888',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                }}
              >
                {isSpeaking ? '⏹ Stop' : '🔊 Play'}
              </button>
              <span
                style={{
                  background: 'rgba(91,189,255,0.1)',
                  border: '1px solid rgba(91,189,255,0.2)',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 12,
                  color: '#5bbdff',
                  fontWeight: 600,
                }}
              >
                {answer.subject}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#444' }}>
              {selectedLang.flag} {answer.language}
            </span>
          </div>

          {/* Answer text */}
          <div>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
              Answer
            </div>
            <div
              style={{
                color: '#c0c0d0',
              }}
            >
              <MathMarkdown content={answer.answer_text} />
            </div>
          </div>

          {/* Key Terms */}
          {answer.key_terms && answer.key_terms.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                Key Terms (click to expand)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {answer.key_terms.map((kt, i) => (
                  <KeyTermChip key={i} term={kt.term} definition={kt.definition} />
                ))}
              </div>
            </div>
          )}

          {/* Follow-up questions */}
          {answer.follow_up_prompts && answer.follow_up_prompts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
                Ask a follow-up
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {answer.follow_up_prompts.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleFollowUp(q)}
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      border: '1px solid #2a2a38',
                      borderRadius: 10,
                      color: '#9b6dff',
                      fontSize: 13,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(155,109,255,0.06)'
                      e.currentTarget.style.borderColor = '#9b6dff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = '#2a2a38'
                    }}
                  >
                    ➤ {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

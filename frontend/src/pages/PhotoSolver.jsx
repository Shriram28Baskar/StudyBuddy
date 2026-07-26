import { useState, useEffect, useRef, useCallback } from 'react'
import { photoSolverAPI } from '../services/api'

const SUBJECTS = ['', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science']

const DIFFICULTY_CONFIG = {
  easy:   { label: 'Easy',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  hard:   { label: 'Hard',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
}

// ─── tiny helpers ────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function copyToClipboard(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text)
  const el = document.createElement('textarea')
  el.value = text
  document.body.appendChild(el)
  el.select()
  document.execCommand('copy')
  document.body.removeChild(el)
  return Promise.resolve()
}

// ─── sub-components ──────────────────────────────────────────────────────────

function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      color,
      background: bg,
      border: `1px solid ${color}44`,
      letterSpacing: '0.02em',
    }}>
      {label}
    </span>
  )
}

function PulsingDot({ color = '#9b6dff' }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 10,
      height: 10,
      borderRadius: '50%',
      background: color,
      animation: 'photosolver-pulse 1.2s ease-in-out infinite',
    }} />
  )
}

function LoadingCard({ message }) {
  return (
    <div style={{
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 16,
      padding: '48px 32px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 20,
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#9b6dff',
            display: 'inline-block',
            animation: `photosolver-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <p style={{ color: '#9b6dff', fontSize: 18, fontWeight: 600, margin: 0 }}>
        {message}
      </p>
      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
        This may take a few seconds…
      </p>
    </div>
  )
}

function StepCard({ step, visible }) {
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 14,
      padding: '20px 20px',
      display: 'flex',
      gap: 16,
    }}>
      {/* Step number circle */}
      <div style={{
        flexShrink: 0,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #9b6dff, #7c3aed)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: 15,
      }}>
        {step.step_number}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Description */}
        <p style={{ margin: '0 0 10px', color: '#e2e0f0', fontSize: 15, lineHeight: 1.55 }}>
          {step.description}
        </p>

        {/* Working / equation box */}
        {step.working && (
          <div style={{
            background: '#0d0b14',
            border: '1px solid #2a2640',
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: 'monospace',
            fontSize: 14,
            color: '#c4b5fd',
            marginBottom: step.note ? 10 : 0,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {step.working}
          </div>
        )}

        {/* Note / tip */}
        {step.note && step.note !== 'null' && (
          <p style={{
            margin: 0,
            fontSize: 13,
            color: '#a89bc2',
            fontStyle: 'italic',
            paddingLeft: 8,
            borderLeft: '2px solid #9b6dff55',
          }}>
            💡 {step.note}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhotoSolver() {
  // core state
  const [imageFile,     setImageFile]     = useState(null)
  const [imagePreview,  setImagePreview]  = useState(null)
  const [subject,       setSubject]       = useState('')
  const [solution,      setSolution]      = useState(null)
  const [stage,         setStage]         = useState('idle')   // idle|uploading|extracting|solving|done|error
  const [error,         setError]         = useState('')
  const [revealedSteps, setRevealedSteps] = useState(0)
  const [copyDone,      setCopyDone]      = useState(false)
  const [isDragging,    setIsDragging]    = useState(false)

  const fileInputRef = useRef(null)

  // ── keyframe styles injected once ───────────────────────────────────────
  useEffect(() => {
    const id = 'photosolver-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes photosolver-pulse {
        0%,100% { opacity:1; transform:scale(1); }
        50%      { opacity:0.4; transform:scale(0.7); }
      }
      @keyframes photosolver-bounce {
        0%,80%,100% { transform:translateY(0); }
        40%          { transform:translateY(-10px); }
      }
    `
    document.head.appendChild(style)
  }, [])

  // ── step reveal animation ────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'done' || !solution) return
    setRevealedSteps(0)
    const timer = setInterval(() => {
      setRevealedSteps(n => {
        if (n >= solution.solution_steps.length) {
          clearInterval(timer)
          return n
        }
        return n + 1
      })
    }, 200)
    return () => clearInterval(timer)
  }, [stage, solution])

  // ── file selection ───────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setError('Unsupported file type. Please upload JPG, PNG, or WEBP.')
      setStage('error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10 MB.')
      setStage('error')
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setSolution(null)
    setStage('idle')
    setError('')
    setRevealedSteps(0)
  }, [])

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true)  }
  const onDragLeave = ()  => { setIsDragging(false) }

  // ── submit ───────────────────────────────────────────────────────────────
  const handleSolve = async () => {
    if (!imageFile) return
    setStage('extracting')
    setError('')
    setSolution(null)

    try {
      setStage('solving')  // show unified loading (both passes happen server-side)
      const { data } = await photoSolverAPI.solve({ imageFile: imageFile, subject })
      setSolution(data)
      setStage('done')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStage('error')
    }
  }

  // ── reset ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setImageFile(null)
    setImagePreview(null)
    setSolution(null)
    setStage('idle')
    setError('')
    setRevealedSteps(0)
    setCopyDone(false)
  }

  // ── copy solution ────────────────────────────────────────────────────────
  const handleCopy = async () => {
    if (!solution) return
    const lines = [
      `Question: ${solution.detected_question}`,
      `Subject: ${solution.detected_subject} | Difficulty: ${solution.difficulty}`,
      '',
      '--- Solution Steps ---',
      ...solution.solution_steps.map(s =>
        `Step ${s.step_number}: ${s.description}` +
        (s.working ? `\n  Working: ${s.working}` : '') +
        (s.note && s.note !== 'null' ? `\n  Note: ${s.note}` : '')
      ),
      '',
      `Final Answer: ${solution.final_answer}`,
      '',
      `Key Concepts: ${solution.key_concepts.join(', ')}`,
    ]
    try {
      await copyToClipboard(lines.join('\n'))
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2500)
    } catch (_) {}
  }

  // ── derived ──────────────────────────────────────────────────────────────
  const isLoading = stage === 'extracting' || stage === 'solving' || stage === 'uploading'
  const diffConf  = solution ? (DIFFICULTY_CONFIG[solution.difficulty] ?? DIFFICULTY_CONFIG.medium) : null

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', paddingBottom: 60 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#fff',
          margin: '0 0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{
            background: 'linear-gradient(135deg, #9b6dff, #7c3aed)',
            borderRadius: 12,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}>
            📷
          </span>
          Photo Solver
        </h1>
        <p style={{ color: '#6b7280', margin: 0, fontSize: 14 }}>
          Snap a photo of any question — AI will extract, solve and explain it step by step.
        </p>
      </div>

      {/* ── Upload Zone (shown when no image yet or after reset) ── */}
      {!imageFile && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: isDragging ? 'rgba(155,109,255,0.06)' : '#14121a',
            border: `2px dashed ${isDragging ? '#9b6dff' : '#2e2b3d'}`,
            borderRadius: 20,
            padding: '56px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 52, marginBottom: 16 }}>📷</div>
          <p style={{ color: '#e2e0f0', fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            Drop a photo or click to upload
          </p>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 24px' }}>
            Supported formats: JPG, PNG, WEBP · Max 10 MB
          </p>

          {/* Subject hint */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}
          >
            <label style={{ color: '#9b6dff', fontSize: 13, fontWeight: 600 }}>Subject hint:</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                background: '#0d0b14',
                border: '1px solid #2e2b3d',
                borderRadius: 8,
                color: '#e2e0f0',
                padding: '6px 12px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {SUBJECTS.map(s => (
                <option key={s} value={s}>{s || '(Auto-detect)'}</option>
              ))}
            </select>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* ── Image Preview + Solve Button ── */}
      {imageFile && !isLoading && stage !== 'done' && (
        <div style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 20,
          overflow: 'hidden',
          marginBottom: 24,
        }}>
          {/* image */}
          <div style={{ position: 'relative', background: '#0a0a0e', textAlign: 'center', padding: 16 }}>
            <img
              src={imagePreview}
              alt="Selected"
              style={{
                maxHeight: 300,
                maxWidth: '100%',
                borderRadius: 12,
                objectFit: 'contain',
              }}
            />
          </div>

          {/* file info */}
          <div style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e1e2a',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, color: '#e2e0f0', fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imageFile.name}
              </p>
              <p style={{ margin: 0, color: '#555', fontSize: 12, marginTop: 2 }}>
                {formatBytes(imageFile.size)} · {imageFile.type}
              </p>
            </div>

            {/* Subject hint inline */}
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                background: '#0d0b14',
                border: '1px solid #2e2b3d',
                borderRadius: 8,
                color: '#e2e0f0',
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {SUBJECTS.map(s => (
                <option key={s} value={s}>{s || 'Auto-detect'}</option>
              ))}
            </select>

            <button
              onClick={handleReset}
              style={{
                background: 'transparent',
                border: '1px solid #2e2b3d',
                borderRadius: 8,
                color: '#6b7280',
                padding: '6px 12px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ✕ Remove
            </button>
          </div>

          {/* Error display */}
          {stage === 'error' && (
            <div style={{
              margin: '0 16px 16px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: '12px 16px',
              color: '#f87171',
              fontSize: 14,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Solve button */}
          <div style={{ padding: '0 16px 20px', textAlign: 'center' }}>
            <button
              onClick={handleSolve}
              style={{
                background: 'linear-gradient(135deg, #9b6dff, #7c3aed)',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                padding: '14px 40px',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.02em',
                boxShadow: '0 4px 20px rgba(155,109,255,0.35)',
                transition: 'all 0.2s',
                width: '100%',
                maxWidth: 360,
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(155,109,255,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';   e.currentTarget.style.boxShadow = '0 4px 20px rgba(155,109,255,0.35)' }}
            >
              Solve This Problem →
            </button>
          </div>
        </div>
      )}

      {/* ── Loading States ── */}
      {stage === 'extracting' && <LoadingCard message="🔍 Reading the question..." />}
      {stage === 'solving'    && <LoadingCard message="🧠 Solving step by step..." />}
      {stage === 'uploading'  && <LoadingCard message="📤 Uploading image..." />}

      {/* ── Error (no image) ── */}
      {stage === 'error' && !imageFile && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 14,
          padding: '20px 24px',
          color: '#f87171',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div>
            <p style={{ margin: 0, fontWeight: 600 }}>Error</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#fc8181' }}>{error}</p>
          </div>
          <button
            onClick={handleReset}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8,
              color: '#f87171',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── SOLUTION ── */}
      {stage === 'done' && solution && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Detected question */}
          <div style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '20px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Detected Question
              </span>
              <Badge label={solution.detected_subject} color="#9b6dff" bg="rgba(155,109,255,0.12)" />
              <Badge
                label={diffConf.label}
                color={diffConf.color}
                bg={diffConf.bg}
              />
            </div>
            <p style={{ margin: 0, color: '#e2e0f0', fontSize: 16, lineHeight: 1.6 }}>
              {solution.detected_question}
            </p>
          </div>

          {/* Steps */}
          <div>
            <h2 style={{ color: '#9b6dff', fontSize: 16, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📝</span> Solution Steps
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {solution.solution_steps.map((step, i) => (
                <StepCard key={step.step_number} step={step} visible={i < revealedSteps} />
              ))}
            </div>
          </div>

          {/* Final Answer */}
          <div style={{
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 16,
            padding: '20px 24px',
          }}>
            <p style={{ color: '#4ade80', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>✅</span> Final Answer
            </p>
            <p style={{ margin: 0, color: '#bbf7d0', fontSize: 20, fontWeight: 700, lineHeight: 1.5 }}>
              {solution.final_answer}
            </p>
          </div>

          {/* Key Concepts */}
          {solution.key_concepts?.length > 0 && (
            <div style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              padding: '20px 24px',
            }}>
              <h3 style={{ color: '#e2e0f0', fontSize: 14, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                🔑 Key Concepts
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {solution.key_concepts.map((c, i) => (
                  <span key={i} style={{
                    background: 'rgba(155,109,255,0.08)',
                    border: '1px solid rgba(155,109,255,0.3)',
                    borderRadius: 20,
                    padding: '5px 14px',
                    color: '#c4b5fd',
                    fontSize: 13,
                    fontWeight: 500,
                  }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Common Mistakes */}
          {solution.common_mistakes?.length > 0 && (
            <div style={{
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 16,
              padding: '20px 24px',
            }}>
              <h3 style={{ color: '#fbbf24', fontSize: 14, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⚠️ Common Mistakes
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {solution.common_mistakes.map((m, i) => (
                  <li key={i} style={{ color: '#fde68a', fontSize: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: '#f59e0b', marginTop: 2, flexShrink: 0 }}>▸</span>
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Practice More */}
          {solution.similar_questions?.length > 0 && (
            <div style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              padding: '20px 24px',
            }}>
              <h3 style={{ color: '#e2e0f0', fontSize: 14, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                💪 Practice More
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {solution.similar_questions.map((q, i) => (
                  <div key={i} style={{
                    background: '#0d0b14',
                    border: '1px solid #2a2640',
                    borderRadius: 10,
                    padding: '12px 16px',
                    color: '#a89bc2',
                    fontSize: 14,
                    lineHeight: 1.5,
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}>
                    <span style={{
                      color: '#9b6dff',
                      fontWeight: 700,
                      fontSize: 13,
                      background: 'rgba(155,109,255,0.12)',
                      borderRadius: 6,
                      padding: '2px 7px',
                      flexShrink: 0,
                    }}>
                      Q{i + 1}
                    </span>
                    {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleCopy}
              style={{
                background: copyDone ? 'rgba(34,197,94,0.12)' : '#14121a',
                border: `1px solid ${copyDone ? 'rgba(34,197,94,0.4)' : '#2e2b3d'}`,
                borderRadius: 10,
                color: copyDone ? '#4ade80' : '#9b6dff',
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {copyDone ? '✅ Copied!' : '📋 Copy Solution'}
            </button>

            <button
              onClick={handleReset}
              style={{
                background: 'linear-gradient(135deg, #9b6dff, #7c3aed)',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                padding: '10px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(155,109,255,0.3)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(155,109,255,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)';   e.currentTarget.style.boxShadow = '0 4px 16px rgba(155,109,255,0.3)' }}
            >
              📷 Solve Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

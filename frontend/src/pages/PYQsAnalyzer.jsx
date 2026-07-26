import { useState, useRef, useCallback, useEffect } from 'react'
import { pyqsAPI } from '../services/api'

// ── Design tokens matching app theme ─────────────────────────────────
const C = {
  bg:       '#0a0a0e',
  card:     '#14121a',
  border:   '#1e1e2a',
  border2:  '#2a2a38',
  brand:    '#9b6dff',
  brandDim: '#5c35aa',
  text:     '#e8e4f0',
  sub:      '#aaa',
  muted:    '#666',
  hint:     '#444',
  green:    '#5bff9b',
  blue:     '#5bbdff',
  orange:   '#ff9b5b',
  pink:     '#ff5b9b',
  yellow:   '#ffdb5b',
  red:      '#ff5b5b',
}

// ── Step indicators ───────────────────────────────────────────────────
const STEPS = ['Select Mode', 'Upload Papers', 'View Analysis']

function StepBar({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
      {STEPS.map((label, i) => {
        const active  = i === step
        const done    = i < step
        const color   = done ? C.green : active ? C.brand : C.hint
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? `${C.green}20` : active ? `${C.brand}20` : 'transparent',
                border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color,
                transition: 'all 0.3s',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color, whiteSpace: 'nowrap', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 12px', marginBottom: 20,
                background: done ? C.green : C.border,
                transition: 'background 0.3s',
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Mode selection card ───────────────────────────────────────────────
function ModeCard({ mode, selected, onSelect }) {
  const [hovered, setHovered] = useState(false)
  const isSem = mode === 'semester'
  const color = isSem ? C.brand : C.blue
  return (
    <button
      onClick={() => onSelect(mode)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, padding: '28px 24px', borderRadius: 14,
        background: selected ? `${color}12` : hovered ? `${color}08` : C.card,
        border: `2px solid ${selected ? color : hovered ? `${color}50` : C.border}`,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.2s', transform: selected ? 'translateY(-2px)' : 'none',
        boxShadow: selected ? `0 8px 32px ${color}20` : 'none',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 12 }}>{isSem ? '📘' : '📋'}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: selected ? color : C.text, marginBottom: 6 }}>
        {isSem ? 'Semester Exam' : 'CAE'}
      </div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
        {isSem
          ? '5-chapter examination with 2-mark and 16-mark questions'
          : '2-chapter assessment with 2-mark and 12-mark questions'}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(isSem
          ? ['5 Chapters', '2 + 16 Marks', '10+10 Model Paper']
          : ['2 Chapters', '2 + 12 Marks', '10+10 Model Paper']
        ).map(tag => (
          <span key={tag} style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 20,
            background: `${color}18`, color, border: `1px solid ${color}40`,
            fontWeight: 600,
          }}>{tag}</span>
        ))}
      </div>
    </button>
  )
}

// ── Upload zone ───────────────────────────────────────────────────────
function UploadZone({ files, onFiles }) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf'))
    if (dropped.length) onFiles(prev => [...prev, ...dropped])
  }, [onFiles])

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? C.brand : C.border2}`,
          borderRadius: 12, padding: '40px 24px', textAlign: 'center',
          background: dragOver ? `${C.brand}08` : C.card,
          cursor: 'pointer', transition: 'all 0.2s',
        }}
      >
        <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
          onChange={e => onFiles(prev => [...prev, ...Array.from(e.target.files)])} />
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.8 }}>📄</div>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 4 }}>
          Drop PDF files here or <span style={{ color: C.brand }}>click to browse</span>
        </div>
        <div style={{ fontSize: 11, color: C.hint }}>
          Supports multiple PDFs · Max 20MB each · Previous year question papers only
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: C.card,
              border: `1px solid ${C.border}`, borderRadius: 8,
            }}>
              <span style={{ fontSize: 16 }}>📑</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.sub }}>{f.name}</div>
                <div style={{ fontSize: 11, color: C.hint }}>{(f.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => onFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: C.hint, cursor: 'pointer', fontSize: 16 }}
                onMouseEnter={e => e.currentTarget.style.color = C.red}
                onMouseLeave={e => e.currentTarget.style.color = C.hint}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 28 }}>
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
          style={{
            padding: '12px 20px', background: 'none', border: 'none',
            borderBottom: `2px solid ${active === tab.id ? C.brand : 'transparent'}`,
            color: active === tab.id ? C.brand : C.muted,
            fontSize: 13, fontWeight: active === tab.id ? 600 : 400,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Frequency badge ───────────────────────────────────────────────────
function FreqBadge({ freq }) {
  if (!freq) return null
  const color = freq >= 3 ? C.green : freq === 2 ? C.yellow : C.muted
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 20,
      background: `${color}18`, color, border: `1px solid ${color}40`,
      fontWeight: 600, flexShrink: 0,
    }}>↑{freq}x</span>
  )
}

// ── Years badge ───────────────────────────────────────────────────────
function YearTags({ years }) {
  if (!years?.length) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {years.map(y => (
        <span key={y} style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 4,
          background: `${C.blue}14`, color: C.blue,
          border: `1px solid ${C.blue}30`,
        }}>{y}</span>
      ))}
    </div>
  )
}

// ── Chapter accordion ─────────────────────────────────────────────────
function ChapterBlock({ chapter, children, color = C.brand, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: `1px solid ${color}30`, borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', background: `${color}08`, border: 'none', cursor: 'pointer',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 14, fontWeight: 600, color }}>{chapter}</span>
        </div>
        <span style={{ color: C.hint, fontSize: 12, transform: open ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ padding: '16px 18px', background: C.card }}>{children}</div>}
    </div>
  )
}

// ── Mark section label ────────────────────────────────────────────────
function MarkLabel({ mark, count }) {
  const color = mark === '2' ? C.orange : C.pink
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 14 }}>
      <span style={{
        fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
        background: `${color}18`, color, border: `1px solid ${color}40`,
      }}>{mark}-Mark Questions</span>
      {count && <span style={{ fontSize: 11, color: C.hint }}>({count} found)</span>}
    </div>
  )
}

// ── Important Questions tab ───────────────────────────────────────────
function ImportantQuestionsTab({ data, highMark }) {
  if (!data?.length) return <div style={{ textAlign: 'center', padding: '40px', color: C.hint }}>No data available.</div>
  return (
    <div>
      {data.map((ch, i) => (
        <ChapterBlock key={i} chapter={ch.chapter} color={[C.brand, C.blue, C.green, C.orange, C.pink][i % 5]}>
          <MarkLabel mark="2" count={ch.two_mark?.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {ch.two_mark?.map((q, j) => (
              <div key={j} style={{
                padding: '10px 14px', background: '#0f0f13',
                border: `1px solid ${C.border}`, borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: C.orange, fontWeight: 700 }}>Q{j + 1}</span>
                      <FreqBadge freq={q.frequency} />
                    </div>
                    <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{q.question}</div>
                    <YearTags years={q.years} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <MarkLabel mark={String(highMark)} count={ch.high_mark?.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ch.high_mark?.map((q, j) => (
              <div key={j} style={{
                padding: '12px 14px', background: '#0f0f13',
                border: `1px solid ${C.border}`, borderRadius: 8,
                borderLeft: `3px solid ${C.pink}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: C.pink, fontWeight: 700 }}>Q{j + 1}</span>
                  <FreqBadge freq={q.frequency} />
                </div>
                <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>{q.question}</div>
                <YearTags years={q.years} />
              </div>
            ))}
          </div>
        </ChapterBlock>
      ))}
    </div>
  )
}

// ── Important Topics tab ──────────────────────────────────────────────
function ImportantTopicsTab({ data, highMark }) {
  if (!data?.length) return <div style={{ textAlign: 'center', padding: '40px', color: C.hint }}>No data available.</div>
  return (
    <div>
      {data.map((ch, i) => (
        <ChapterBlock key={i} chapter={ch.chapter} color={[C.brand, C.blue, C.green, C.orange, C.pink][i % 5]}>
          <MarkLabel mark="2" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {ch.two_mark_topics?.map((t, j) => (
              <span key={j} style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 20,
                background: `${C.orange}14`, color: C.orange,
                border: `1px solid ${C.orange}35`,
              }}>📌 {t}</span>
            ))}
          </div>

          <MarkLabel mark={String(highMark)} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ch.high_mark_topics?.map((t, j) => (
              <span key={j} style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 20,
                background: `${C.pink}14`, color: C.pink,
                border: `1px solid ${C.pink}35`,
              }}>🎯 {t}</span>
            ))}
          </div>
        </ChapterBlock>
      ))}
    </div>
  )
}

// ── Model Paper tab ───────────────────────────────────────────────────
function ModelPaperTab({ paper, highMark, mode }) {
  if (!paper) return <div style={{ textAlign: 'center', padding: '40px', color: C.hint }}>No model paper generated.</div>

  return (
    <div>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${C.brandDim}20, ${C.brand}10)`,
        border: `1px solid ${C.brand}40`, borderRadius: 14, padding: '24px',
        marginBottom: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: C.brand, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
          AI Generated
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 12 }}>{paper.title}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {paper.instructions?.map((ins, i) => (
            <span key={i} style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 6,
              background: `${C.brand}18`, color: C.brand,
              border: `1px solid ${C.brand}30`,
            }}>{ins}</span>
          ))}
        </div>
        {paper.blueprint_notes && (
          <div style={{
            marginTop: 12, fontSize: 11, color: C.muted, fontStyle: 'italic',
            padding: '8px 14px', background: '#0f0f1380', borderRadius: 6,
          }}>
            📐 {paper.blueprint_notes}
          </div>
        )}
      </div>

      {/* Part A */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          paddingBottom: 10, borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{
            fontSize: 12, padding: '4px 14px', borderRadius: 6, fontWeight: 700,
            background: `${C.orange}18`, color: C.orange, border: `1px solid ${C.orange}40`,
          }}>PART A</span>
          <span style={{ fontSize: 13, color: C.muted }}>2-Mark Questions — (10 × 2 = 20 Marks)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {paper.two_mark_questions?.map((q, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, padding: '10px 14px',
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 13, color: C.sub, lineHeight: 1.6,
            }}>
              <span style={{ color: C.orange, fontWeight: 600, flexShrink: 0, minWidth: 20 }}>{i + 1}.</span>
              <span>{q.replace(/^\d+\.\s*/, '')}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Part B */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
          paddingBottom: 10, borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{
            fontSize: 12, padding: '4px 14px', borderRadius: 6, fontWeight: 700,
            background: `${C.pink}18`, color: C.pink, border: `1px solid ${C.pink}40`,
          }}>PART B</span>
          <span style={{ fontSize: 13, color: C.muted }}>{highMark}-Mark Questions — (10 × {highMark} = {10 * highMark} Marks)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paper.high_mark_questions?.map((q, i) => (
            <div key={i} style={{
              padding: '14px 16px', background: C.card,
              border: `1px solid ${C.border}`, borderRadius: 8,
              borderLeft: `3px solid ${C.pink}`,
            }}>
              <div style={{ fontSize: 11, color: C.pink, fontWeight: 700, marginBottom: 6 }}>
                Question {i + 11}
              </div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.7 }}>
                {q.replace(/^\d+\.\s*/, '')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Loading overlay ───────────────────────────────────────────────────
const ANALYZING_STEPS = [
  'Extracting text from PDFs...',
  'Detecting chapter structure...',
  'Analyzing question patterns...',
  'Identifying frequent topics...',
  'Generating model paper...',
]

function AnalyzingOverlay({ mode }) {
  const [stepIdx, setStepIdx] = useState(0)
  
  useEffect(() => {
    const t = setInterval(() => setStepIdx(i => (i + 1) % ANALYZING_STEPS.length), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,10,14,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border2}`,
        borderRadius: 16, padding: '40px 48px', textAlign: 'center',
        maxWidth: 400,
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>
          Analyzing {mode === 'semester' ? 'Semester' : 'CAE'} Papers
        </div>
        <div style={{ fontSize: 13, color: C.brand, marginBottom: 24, minHeight: 20 }}>
          {ANALYZING_STEPS[stepIdx]}
        </div>
        <div style={{ width: '100%', height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: '35%',
            background: `linear-gradient(90deg, ${C.brand}, ${C.blue})`,
            borderRadius: 2, animation: 'lbar 1.6s ease-in-out infinite',
          }} />
        </div>
        <style>{`@keyframes lbar{0%{transform:translateX(-200%)}100%{transform:translateX(400%)}}`}</style>
      </div>
    </div>
  )
}

// ── Summary chips ─────────────────────────────────────────────────────
function SummaryChips({ result }) {
  const chips = [
    { icon: '📚', label: `${result.chapters_detected?.length} Chapters` },
    { icon: '❓', label: `${result.important_questions?.reduce((a, c) => a + (c.two_mark?.length || 0) + (c.high_mark?.length || 0), 0)} Key Questions` },
    { icon: '🏷️', label: `${result.important_topics?.reduce((a, c) => a + (c.two_mark_topics?.length || 0) + (c.high_mark_topics?.length || 0), 0)} Topics` },
    { icon: '📝', label: 'Model Paper Ready' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
      {chips.map((c, i) => {
        const colors = [C.brand, C.green, C.orange, C.blue]
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 14px', background: `${colors[i]}10`,
            border: `1px solid ${colors[i]}30`, borderRadius: 8,
          }}>
            <span>{c.icon}</span>
            <span style={{ fontSize: 12, color: colors[i], fontWeight: 600 }}>{c.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
export default function PYQsAnalyzer() {
  const [step,      setStep]      = useState(0)       // 0=mode, 1=upload, 2=results
  const [mode,      setMode]      = useState(null)    // 'semester' | 'cae'
  const [files,     setFiles]     = useState([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [result,    setResult]    = useState(null)
  const [activeTab, setActiveTab] = useState('questions')

  const highMark = mode === 'semester' ? 16 : 12

  const TABS = [
    { id: 'questions', icon: '❓', label: 'Important Questions' },
    { id: 'topics',    icon: '🏷️', label: 'Important Topics' },
    { id: 'model',     icon: '📝', label: 'Model Paper' },
  ]

  async function handleAnalyze() {
    if (!files.length) { setError('Please upload at least one PDF.'); return }
    setError(null); setLoading(true)
    try {
      const { data } = await pyqsAPI.analyze({ mode, files })
      setResult(data)
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setStep(0); setMode(null); setFiles([]); setResult(null); setError(null)
  }

  return (
    <div style={{ maxWidth: 860, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {loading && <AnalyzingOverlay mode={mode} />}

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{
              fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400,
              fontSize: 28, color: C.text, marginBottom: 4,
            }}>PYQs Analyzer</h1>
            <p style={{ color: C.hint, fontSize: 13 }}>
              Upload previous year question papers and get AI-powered exam insights.
            </p>
          </div>
          {step > 0 && (
            <button onClick={reset} style={{
              background: 'none', border: `1px solid ${C.border2}`, borderRadius: 7,
              padding: '6px 14px', color: C.muted, fontSize: 12, cursor: 'pointer',
            }}>↺ Start Over</button>
          )}
        </div>
      </div>

      <StepBar step={step} />

      {/* Step 0: Mode Selection */}
      {step === 0 && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
            Choose your exam type to begin:
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
            <ModeCard mode="semester" selected={mode === 'semester'} onSelect={setMode} />
            <ModeCard mode="cae"      selected={mode === 'cae'}      onSelect={setMode} />
          </div>
          <button
            onClick={() => { if (mode) setStep(1) }}
            disabled={!mode}
            style={{
              background: mode ? C.brandDim : C.border, border: 'none',
              borderRadius: 9, padding: '11px 28px', color: mode ? '#fff' : C.hint,
              fontSize: 13, fontWeight: 500, cursor: mode ? 'pointer' : 'not-allowed',
            }}
          >
            Continue →
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 1 && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            padding: '10px 16px', background: `${C.brand}10`,
            border: `1px solid ${C.brand}30`, borderRadius: 8,
          }}>
            <span>{mode === 'semester' ? '📘' : '📋'}</span>
            <span style={{ fontSize: 13, color: C.brand, fontWeight: 500 }}>
              {mode === 'semester' ? 'Semester Exam' : 'CAE'} — Upload your previous year papers
            </span>
          </div>

          <UploadZone files={files} onFiles={setFiles} />

          {error && (
            <div style={{
              marginTop: 14, padding: '10px 14px', background: '#2a0d0d',
              border: `1px solid #4d1515`, borderRadius: 8, color: C.red, fontSize: 12,
            }}>⚠ {error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => setStep(0)} style={{
              background: 'none', border: `1px solid ${C.border2}`,
              borderRadius: 9, padding: '11px 20px', color: C.muted,
              fontSize: 13, cursor: 'pointer',
            }}>← Back</button>
            <button
              onClick={handleAnalyze}
              disabled={!files.length || loading}
              style={{
                background: files.length ? C.brandDim : C.border, border: 'none',
                borderRadius: 9, padding: '11px 28px',
                color: files.length ? '#fff' : C.hint,
                fontSize: 13, fontWeight: 500, cursor: files.length ? 'pointer' : 'not-allowed',
              }}
            >
              ✦ Analyze Papers
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Results */}
      {step === 2 && result && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
          <SummaryChips result={result} />
          <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

          {activeTab === 'questions' && (
            <ImportantQuestionsTab data={result.important_questions} highMark={highMark} />
          )}
          {activeTab === 'topics' && (
            <ImportantTopicsTab data={result.important_topics} highMark={highMark} />
          )}
          {activeTab === 'model' && (
            <ModelPaperTab paper={result.model_paper} highMark={highMark} mode={mode} />
          )}
        </div>
      )}
    </div>
  )
}

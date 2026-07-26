import { useState, useRef, useCallback } from 'react'
import { gapAnalysisAPI } from '../services/api'

// ── Priority colour map ───────────────────────────────────────────────
const PRIORITY_COLORS = {
  critical: '#ff5b5b',
  high:     '#ff9b5b',
  medium:   '#ffdb5b',
  low:      '#5bbdff',
  skip:     '#555',
}

const PRIORITY_BG = {
  critical: 'rgba(255,91,91,0.12)',
  high:     'rgba(255,155,91,0.12)',
  medium:   'rgba(255,219,91,0.12)',
  low:      'rgba(91,189,255,0.12)',
  skip:     'rgba(85,85,85,0.12)',
}

// Loading steps cycled during analysis
const LOADING_STEPS = [
  '📄 Extracting PDF text...',
  '🧠 Parsing syllabus topics...',
  '🔍 Mapping topics to PYQs...',
  '📊 Computing priority scores...',
  '💡 Generating exam insights...',
]

// ── Sub-components ────────────────────────────────────────────────────

function DropZone({ label, icon, multiple, files, onChange, accept = '.pdf' }) {
  const inputRef = useRef()

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      const dropped = Array.from(e.dataTransfer.files).filter((f) =>
        f.name.toLowerCase().endsWith('.pdf')
      )
      if (!dropped.length) return
      onChange(multiple ? dropped : [dropped[0]])
    },
    [multiple, onChange]
  )

  const handleClick = () => inputRef.current?.click()

  const handleChange = (e) => {
    const chosen = Array.from(e.target.files)
    onChange(multiple ? chosen : [chosen[0]])
    e.target.value = ''
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={handleClick}
      style={{
        border: '2px dashed #2a2a38',
        borderRadius: 12,
        padding: '28px 20px',
        textAlign: 'center',
        cursor: 'pointer',
        background: '#0d0d14',
        transition: 'border-color 0.2s, background 0.2s',
        minHeight: 130,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#9b6dff'
        e.currentTarget.style.background = 'rgba(155,109,255,0.05)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#2a2a38'
        e.currentTarget.style.background = '#0d0d14'
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      <span style={{ fontSize: 28 }}>{icon}</span>
      <div style={{ fontSize: 13, color: '#9b6dff', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#555' }}>
        {multiple ? 'Click or drag multiple PDFs' : 'Click or drag one PDF'}
      </div>
      {files && files.length > 0 && (
        <div
          style={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            width: '100%',
            maxHeight: 100,
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {files.map((f, i) => (
            <div
              key={i}
              style={{
                fontSize: 11,
                color: '#a0a0b0',
                background: '#1a1826',
                padding: '4px 8px',
                borderRadius: 6,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              📄 {f.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ priority }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color: PRIORITY_COLORS[priority] || '#aaa',
        background: PRIORITY_BG[priority] || 'rgba(255,255,255,0.05)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        border: `1px solid ${PRIORITY_COLORS[priority] || '#444'}`,
      }}
    >
      {priority}
    </span>
  )
}

function FrequencyBar({ frequency, max }) {
  const pct = max > 0 ? Math.min((frequency / max) * 100, 100) : 0
  const color =
    pct >= 75 ? '#ff5b5b' : pct >= 50 ? '#ff9b5b' : pct >= 25 ? '#ffdb5b' : '#5bbdff'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minWidth: 80,
      }}
    >
      <div
        style={{
          flex: 1,
          height: 6,
          background: '#1e1e2a',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: '#666', minWidth: 20, textAlign: 'right' }}>
        {frequency}
      </span>
    </div>
  )
}

function TopicRow({ topic, maxFreq, expanded, onToggle }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: 'pointer',
          borderBottom: '1px solid #1a1a26',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(155,109,255,0.06)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <td style={{ padding: '10px 12px', fontSize: 13, color: '#ddd', maxWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#555', fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
            {topic.topic}
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 11, color: '#777', maxWidth: 160 }}>
          {topic.unit}
        </td>
        <td style={{ padding: '10px 16px', minWidth: 120 }}>
          <FrequencyBar frequency={topic.frequency} max={maxFreq} />
        </td>
        <td style={{ padding: '10px 12px' }}>
          <PriorityBadge priority={topic.priority} />
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12, color: '#9b6dff', textAlign: 'right' }}>
          {topic.study_hours_suggested > 0 ? `${topic.study_hours_suggested}h` : '—'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: 0 }}>
            <div
              style={{
                background: 'rgba(155,109,255,0.04)',
                borderLeft: `3px solid ${PRIORITY_COLORS[topic.priority]}`,
                padding: '12px 20px',
                display: 'flex',
                gap: 32,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Years Appeared
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {topic.years_appeared && topic.years_appeared.length > 0 ? (
                    topic.years_appeared.map((yr) => (
                      <span
                        key={yr}
                        style={{
                          background: '#1e1e2a',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          color: '#9b6dff',
                        }}
                      >
                        {yr}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: '#555' }}>Never</span>
                  )}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Recommendation
                </div>
                <div style={{ fontSize: 12, color: '#c0c0d0', lineHeight: 1.5 }}>{topic.action}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────

export default function GapAnalysis() {
  const [pyqFiles, setPyqFiles]         = useState([])
  const [syllabusFile, setSyllabusFile] = useState(null)
  const [subject, setSubject]           = useState('')
  const [yearsCovered, setYearsCovered] = useState(3)
  const [result, setResult]             = useState(null)
  const [loading, setLoading]           = useState(false)
  const [loadingStep, setLoadingStep]   = useState(0)
  const [error, setError]               = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedTopic, setExpandedTopic] = useState(null)
  const [neverExpanded, setNeverExpanded] = useState(false)
  const stepIntervalRef = useRef(null)

  // ── Submit ──────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!pyqFiles.length) { setError('Please upload at least one PYQ PDF.'); return }
    if (!syllabusFile)    { setError('Please upload a syllabus PDF.'); return }
    if (!subject.trim())  { setError('Please enter the subject name.'); return }

    setError(null)
    setResult(null)
    setLoading(true)
    setLoadingStep(0)
    setExpandedTopic(null)

    // Cycle loading steps
    stepIntervalRef.current = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length)
    }, 4000)

    try {
      const { data } = await gapAnalysisAPI.analyze({ pyqFiles, syllabusFile, subject, yearsCovered })
      setResult(data)
      setActiveFilter('all')
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      clearInterval(stepIntervalRef.current)
      setLoading(false)
    }
  }

  // ── Derived data ────────────────────────────────────────────────────
  const allTopics = result
    ? [
        ...(result.critical_topics || []),
        ...(result.high_topics     || []),
        ...(result.medium_topics   || []),
        ...(result.low_topics      || []),
        ...(result.skip_topics     || []),
      ]
    : []

  const filteredTopics =
    activeFilter === 'all'
      ? allTopics
      : activeFilter === 'critical' ? (result?.critical_topics || [])
      : activeFilter === 'high'     ? (result?.high_topics     || [])
      : activeFilter === 'medium'   ? (result?.medium_topics   || [])
      : activeFilter === 'skip'     ? (result?.skip_topics     || [])
      : allTopics

  const maxFreq = allTopics.reduce((m, t) => Math.max(m, t.frequency), 0)

  const filterTabs = [
    { key: 'all',      label: 'All',      count: allTopics.length },
    { key: 'critical', label: '🔴 Critical', count: result?.critical_topics?.length || 0 },
    { key: 'high',     label: '🟠 High',     count: result?.high_topics?.length     || 0 },
    { key: 'medium',   label: '🟡 Medium',   count: result?.medium_topics?.length   || 0 },
    { key: 'skip',     label: '⬛ Skip',     count: result?.skip_topics?.length      || 0 },
  ]

  // Study bar data
  const studyBarItems = result
    ? [
        { label: 'Critical', hours: result.study_plan_hours?.critical || 0, color: '#ff5b5b' },
        { label: 'High',     hours: result.study_plan_hours?.high     || 0, color: '#ff9b5b' },
        { label: 'Medium',   hours: result.study_plan_hours?.medium   || 0, color: '#ffdb5b' },
      ]
    : []
  const maxStudyHours = Math.max(...studyBarItems.map((i) => i.hours), 1)

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: '#e0e0f0' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#fff',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          🔬 PYQ Gap Analysis
        </h1>
        <p style={{ fontSize: 14, color: '#666', margin: '6px 0 0' }}>
          Upload PYQ papers and your syllabus to discover high-priority topics for exam prep.
        </p>
      </div>

      {/* ── Upload Card ── */}
      <div
        style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16,
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          {/* PYQ drop zone */}
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              PYQ PDFs ({pyqFiles.length} selected)
            </div>
            <DropZone
              label="Previous Year Questions"
              icon="📋"
              multiple={true}
              files={pyqFiles}
              onChange={setPyqFiles}
            />
          </div>

          {/* Syllabus drop zone */}
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Syllabus PDF {syllabusFile ? `✓` : ''}
            </div>
            <DropZone
              label="Syllabus Document"
              icon="📚"
              multiple={false}
              files={syllabusFile ? [syllabusFile] : []}
              onChange={(files) => setSyllabusFile(files[0] || null)}
            />
          </div>

          {/* Config panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Data Structures"
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 8,
                  padding: '10px 14px',
                  background: '#0d0d14',
                  border: '1px solid #2a2a38',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = '#9b6dff')}
                onBlur={(e) => (e.target.style.borderColor = '#2a2a38')}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Years Covered: {yearsCovered}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={yearsCovered}
                onChange={(e) => setYearsCovered(Number(e.target.value))}
                style={{ display: 'block', width: '100%', marginTop: 10, accentColor: '#9b6dff' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444' }}>
                <span>1 year</span>
                <span>5 years</span>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                padding: '12px 20px',
                background: loading ? '#333' : 'linear-gradient(135deg, #7c3aed, #9b6dff)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s',
                marginTop: 4,
              }}
            >
              {loading ? '⏳ Analyzing...' : '🔬 Analyze Now'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          style={{
            background: 'rgba(255,91,91,0.1)',
            border: '1px solid rgba(255,91,91,0.3)',
            color: '#ff5b5b',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div
          style={{
            background: '#14121a',
            border: '1px solid #1e1e2a',
            borderRadius: 16,
            padding: '40px 24px',
            textAlign: 'center',
            marginBottom: 24,
          }}
        >
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid #1e1e2a',
                borderTop: '3px solid #9b6dff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: 15, color: '#9b6dff', fontWeight: 600 }}>
              {LOADING_STEPS[loadingStep]}
            </div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
              This may take 30–60 seconds for large papers...
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {LOADING_STEPS.map((step, i) => (
              <div
                key={i}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  background: i === loadingStep ? 'rgba(155,109,255,0.15)' : '#0d0d14',
                  color: i === loadingStep ? '#9b6dff' : '#444',
                  border: `1px solid ${i === loadingStep ? '#9b6dff' : '#1e1e2a'}`,
                  transition: 'all 0.3s',
                }}
              >
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results Panel ── */}
      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Summary Bar */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Total Topics', value: result.total_topics, color: '#9b6dff' },
              { label: 'Coverage',     value: `${result.coverage_percentage.toFixed(1)}%`, color: '#5bbdff' },
              { label: 'Years Analyzed', value: result.years_analyzed, color: '#ffdb5b' },
              { label: 'Critical Topics', value: result.critical_topics?.length || 0, color: '#ff5b5b' },
              { label: 'Total Study Hours', value: `${result.study_plan_hours?.total || 0}h`, color: '#5bffb5' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: '#14121a',
                  border: `1px solid ${color}33`,
                  borderRadius: 12,
                  padding: '12px 20px',
                  flex: '1 1 140px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter Tabs + Topic Table */}
          <div
            style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {/* Filter tabs */}
            <div
              style={{
                display: 'flex',
                gap: 0,
                borderBottom: '1px solid #1e1e2a',
                padding: '0 12px',
                overflowX: 'auto',
              }}
            >
              {filterTabs.map((tab) => {
                const active = activeFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveFilter(tab.key); setExpandedTopic(null) }}
                    style={{
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: active ? '2px solid #9b6dff' : '2px solid transparent',
                      color: active ? '#9b6dff' : '#666',
                      fontSize: 13,
                      fontWeight: active ? 700 : 400,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'color 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {tab.label}
                    <span
                      style={{
                        background: active ? 'rgba(155,109,255,0.2)' : '#1e1e2a',
                        color: active ? '#9b6dff' : '#555',
                        borderRadius: 10,
                        fontSize: 10,
                        padding: '1px 6px',
                        fontWeight: 700,
                      }}
                    >
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Table */}
            {filteredTopics.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#0d0d14' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Topic</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Unit</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 120 }}>Frequency</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Priority</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, color: '#555', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Study hrs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTopics.map((topic, i) => (
                      <TopicRow
                        key={`${activeFilter}-${i}`}
                        topic={topic}
                        maxFreq={maxFreq}
                        expanded={expandedTopic === `${activeFilter}-${i}`}
                        onToggle={() =>
                          setExpandedTopic(
                            expandedTopic === `${activeFilter}-${i}` ? null : `${activeFilter}-${i}`
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: '#555', fontSize: 14 }}>
                No topics in this category.
              </div>
            )}
          </div>

          {/* Never Appeared Box */}
          {result.never_appeared && result.never_appeared.length > 0 && (
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <button
                onClick={() => setNeverExpanded((p) => !p)}
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '14px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: '#888',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>🚫 Never Appeared in PYQs ({result.never_appeared.length} topics)</span>
                <span>{neverExpanded ? '▲' : '▼'}</span>
              </button>
              {neverExpanded && (
                <div
                  style={{
                    padding: '12px 20px 16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    borderTop: '1px solid #1e1e2a',
                  }}
                >
                  {result.never_appeared.map((topic, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#1a1826',
                        border: '1px solid #2a2a38',
                        borderRadius: 20,
                        padding: '4px 12px',
                        fontSize: 12,
                        color: '#666',
                      }}
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Insights Cards */}
          {result.insights && result.insights.length > 0 && (
            <div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#fff',
                  margin: '0 0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                💡 Exam Pattern Insights
              </h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {result.insights.map((insight, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#14121a',
                      border: '1px solid #1e1e2a',
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
                    <p style={{ margin: 0, fontSize: 13, color: '#b0b0c0', lineHeight: 1.6 }}>
                      {insight}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Study Hours Allocation Bar Chart */}
          {studyBarItems.some((i) => i.hours > 0) && (
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px 24px',
              }}
            >
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 16px' }}>
                📊 Study Hours Allocation
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {studyBarItems.map(({ label, hours, color }) => (
                  <div key={label}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: '#888',
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ color }}>{label}</span>
                      <span style={{ color: '#aaa', fontWeight: 700 }}>{hours}h</span>
                    </div>
                    <div
                      style={{
                        height: 10,
                        background: '#1e1e2a',
                        borderRadius: 5,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(hours / maxStudyHours) * 100}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 5,
                          transition: 'width 0.6s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                  Total recommended study time:{' '}
                  <strong style={{ color: '#9b6dff' }}>{result.study_plan_hours?.total || 0} hours</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

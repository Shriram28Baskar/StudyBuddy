import { useState, useEffect, useCallback } from 'react'
import useAppStore from '@/store/useAppStore'
import { burnoutAPI } from '../services/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(score) {
  if (score < 30) return '#5bff9b'
  if (score < 50) return '#ffdb5b'
  if (score < 70) return '#ff9b5b'
  return '#ff5b5b'
}

function riskLabel(level) {
  const map = {
    healthy: 'Healthy',
    caution: 'Caution',
    warning: 'Warning',
    critical: 'Critical',
  }
  return map[level] ?? level
}

function severityColor(sev) {
  if (sev === 'high') return '#ff5b5b'
  if (sev === 'medium') return '#ffdb5b'
  return '#5bff9b'
}

function severityBg(sev) {
  if (sev === 'high') return '#1f0a0a'
  if (sev === 'medium') return '#1f1a0a'
  return '#0a1f12'
}

function trendIcon(trend) {
  if (trend === 'improving') return '↑'
  if (trend === 'declining') return '↓'
  return '→'
}

function trendColor(trend) {
  if (trend === 'improving') return '#5bff9b'
  if (trend === 'declining') return '#ff5b5b'
  return '#9b6dff'
}

function formatSignal(signal) {
  return signal
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── SVG Semicircle Gauge ─────────────────────────────────────────────────────

function BurnoutGauge({ score, color, size = 220 }) {
  const radius = 80
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * radius
  const pct = Math.min(1, Math.max(0, score / 100))
  const offset = circumference * (1 - pct)
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`

  return (
    <svg width={size} height={size / 2 + 44} viewBox={`0 0 ${size} ${size / 2 + 44}`}>
      {/* Zone segments */}
      {[
        { pct: 0.3, color: '#5bff9b' },
        { pct: 0.5, color: '#ffdb5b' },
        { pct: 0.7, color: '#ff9b5b' },
        { pct: 1.0, color: '#ff5b5b' },
      ].map((zone, i, arr) => {
        const prev = arr[i - 1]?.pct ?? 0
        const len = (zone.pct - prev) * circumference
        const dashOffset = (1 - prev) * circumference
        return (
          <path
            key={i}
            d={arcPath}
            fill="none"
            stroke={zone.color}
            strokeWidth={14}
            strokeLinecap="butt"
            strokeDasharray={`${len} ${circumference - len}`}
            strokeDashoffset={dashOffset}
            opacity={0.18}
          />
        )
      })}
      {/* Background track */}
      <path
        d={arcPath}
        fill="none"
        stroke="#1e1e2a"
        strokeWidth={12}
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* Score arc */}
      <path
        d={arcPath}
        fill="none"
        stroke={color}
        strokeWidth={14}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }}
      />
      {/* Center text */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={38}
        fontWeight={700}
        fontFamily="inherit"
      >
        {score}
      </text>
      <text
        x={cx}
        y={cy + 22}
        textAnchor="middle"
        fill="#666"
        fontSize={11}
        fontFamily="inherit"
      >
        Mental Load
      </text>
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BurnoutDetector() {
  const userId = useAppStore(s => s.auth.user?.uid ?? null)

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fetchingLast, setFetchingLast] = useState(false)

  // ── Load last report on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    setFetchingLast(true)
    burnoutAPI.getReport(userId)
      .then(({ data }) => {
        if (data) setReport(data)
      })
      .catch(() => {})
      .finally(() => setFetchingLast(false))
  }, [userId])

  // ── Analyze ───────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!userId) {
      setError('You must be logged in to run an analysis.')
      return
    }
    setError('')
    setLoading(true)
    setReport(null)
    try {
      const { data } = await burnoutAPI.analyze(userId)
      setReport(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  const color = report ? riskColor(report.mental_load_score) : '#9b6dff'

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>🧘</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff' }}>
            Burnout Risk Check
          </h1>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Analyze your study patterns to detect early burnout signals and get personalized
          wellbeing recommendations.
        </p>
      </div>

      {/* ── Analyze Card ── */}
      <div
        style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16,
          padding: '24px 28px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#9b6dff', fontWeight: 600, marginBottom: 4 }}>
            ANALYZING FOR
          </div>
          <div style={{ fontSize: 14, color: '#ddd', fontFamily: 'monospace' }}>
            {userId ?? 'Not logged in'}
          </div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
            All your study plans will be scanned for burnout signals.
          </div>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !userId}
          style={{
            padding: '12px 28px',
            background: loading ? '#3a2a6e' : '#9b6dff',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            cursor: loading || !userId ? 'not-allowed' : 'pointer',
            transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? '⏳ Analyzing…' : '🧘 Run Analysis'}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: '#1f0a0a',
            border: '1px solid #ff5b5b44',
            borderRadius: 10,
            color: '#ff5b5b',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {fetchingLast && !report && (
        <div style={{ color: '#555', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          Loading last report…
        </div>
      )}

      {/* ── Result Panel ── */}
      {report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Row 1: Gauge + Risk badge + Trends */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            {/* Gauge */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <BurnoutGauge score={report.mental_load_score} color={color} />
              <div
                style={{
                  padding: '6px 18px',
                  background: `${color}22`,
                  border: `1px solid ${color}55`,
                  borderRadius: 20,
                  color,
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                {riskLabel(report.risk_level).toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: '#555', textAlign: 'center' }}>
                {report.risk_level === 'healthy'
                  ? 'You are in great shape!'
                  : report.risk_level === 'caution'
                  ? 'Minor stress detected'
                  : report.risk_level === 'warning'
                  ? 'Burnout risk detected'
                  : 'High burnout risk — rest needed'}
              </div>
            </div>

            {/* Color zone legend */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                RISK ZONES
              </div>
              {[
                { label: 'Healthy', range: '0–29', color: '#5bff9b' },
                { label: 'Caution', range: '30–49', color: '#ffdb5b' },
                { label: 'Warning', range: '50–69', color: '#ff9b5b' },
                { label: 'Critical', range: '70–100', color: '#ff5b5b' },
              ].map(zone => (
                <div
                  key={zone.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background:
                      riskLabel(report.risk_level) === zone.label
                        ? `${zone.color}14`
                        : 'transparent',
                    border:
                      riskLabel(report.risk_level) === zone.label
                        ? `1px solid ${zone.color}44`
                        : '1px solid transparent',
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: zone.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#ddd', flex: 1 }}>{zone.label}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{zone.range}</span>
                </div>
              ))}
            </div>

            {/* Trends */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                PERFORMANCE TRENDS
              </div>

              {/* Completion trend */}
              <div
                style={{
                  padding: '14px 16px',
                  background: '#0d0d14',
                  border: '1px solid #1e1e2a',
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                  TASK COMPLETION
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: trendColor(report.completion_trend),
                    }}
                  >
                    {trendIcon(report.completion_trend)}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: trendColor(report.completion_trend),
                      textTransform: 'capitalize',
                    }}
                  >
                    {report.completion_trend}
                  </span>
                </div>
              </div>

              {/* Score trend */}
              <div
                style={{
                  padding: '14px 16px',
                  background: '#0d0d14',
                  border: '1px solid #1e1e2a',
                  borderRadius: 10,
                }}
              >
                <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                  TEST SCORES
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: trendColor(report.score_trend),
                    }}
                  >
                    {trendIcon(report.score_trend)}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: trendColor(report.score_trend),
                      textTransform: 'capitalize',
                    }}
                  >
                    {report.score_trend}
                  </span>
                </div>
              </div>

              {/* Analyzed at */}
              <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                Last analyzed:{' '}
                {report.analyzed_at
                  ? new Date(report.analyzed_at).toLocaleString()
                  : 'Now'}
              </div>
            </div>
          </div>

          {/* Row 2: Signal Cards */}
          <div
            style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              padding: '20px 24px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 14 }}>
              🔍 BURNOUT SIGNALS DETECTED
            </div>
            {report.signals_detected && report.signals_detected.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 12,
                }}
              >
                {report.signals_detected.map((sig, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '14px 16px',
                      background: severityBg(sig.severity),
                      border: `1px solid ${severityColor(sig.severity)}33`,
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: severityColor(sig.severity),
                        }}
                      >
                        {formatSignal(sig.signal)}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          background: `${severityColor(sig.severity)}22`,
                          border: `1px solid ${severityColor(sig.severity)}44`,
                          borderRadius: 20,
                          color: severityColor(sig.severity),
                          textTransform: 'uppercase',
                        }}
                      >
                        {sig.severity}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12,
                        color: '#aaa',
                        lineHeight: 1.5,
                      }}
                    >
                      {sig.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  background: '#0a1f12',
                  border: '1px solid #5bff9b33',
                  borderRadius: 12,
                }}
              >
                <span style={{ fontSize: 24 }}>✅</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#5bff9b' }}>
                    No burnout signals detected
                  </div>
                  <div style={{ fontSize: 12, color: '#4a8' }}>
                    Your study patterns look healthy — keep it up!
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Recommendations */}
          <div
            style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              padding: '20px 24px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 14 }}>
              💡 PERSONALIZED RECOMMENDATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(report.recommendations ?? []).map((rec, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '14px 16px',
                    background: '#0d0d14',
                    border: '1px solid #1e1e2a',
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: '#1a1228',
                      border: '1px solid #9b6dff44',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#9b6dff',
                    }}
                  >
                    {i + 1}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
                    {rec}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Row 4: Affirmation Card */}
          <div
            style={{
              background: '#0a1f12',
              border: '1px solid #5bff9b33',
              borderLeft: '4px solid #5bff9b',
              borderRadius: 16,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: '0 0 32px #5bff9b0a',
            }}
          >
            <span style={{ fontSize: 24 }}>💚</span>
            <div>
              <div
                style={{
                  fontSize: 12,
                  color: '#5bff9b',
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                A NOTE FOR YOU
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  color: '#c8ffd4',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                }}
              >
                {report.affirmation}
              </p>
            </div>
          </div>

          {/* Row 5: Break Suggestion (conditional) */}
          {report.suggested_break && (
            <div
              style={{
                background: '#1f140a',
                border: '1px solid #ff9b5b44',
                borderLeft: '4px solid #ff9b5b',
                borderRadius: 16,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                boxShadow: '0 0 24px #ff9b5b0a',
              }}
            >
              <span style={{ fontSize: 24 }}>☕</span>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#ff9b5b',
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  BREAK SUGGESTION
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: '#ffd4b0',
                    lineHeight: 1.6,
                  }}
                >
                  {report.suggested_break}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!report && !loading && !fetchingLast && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#444',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧘</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 8 }}>
            Ready to check your wellbeing?
          </div>
          <div style={{ fontSize: 13 }}>
            Click{' '}
            <strong style={{ color: '#9b6dff' }}>Run Analysis</strong> to scan your study
            plans for burnout signals.
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import useAppStore from '@/store/useAppStore'
import { studyPlanAIAPI, scorePredictorAPI } from '../services/api'

// ─── Colour helpers ──────────────────────────────────────────────────────────

function scoreColor(score) {
  if (score >= 70) return '#5bff9b'
  if (score >= 50) return '#ffdb5b'
  return '#ff5b5b'
}

function gradeColor(grade) {
  const map = {
    O: '#5bff9b',
    'A+': '#7bffb0',
    A: '#ffdb5b',
    'B+': '#ffc85b',
    B: '#ff9b5b',
    C: '#ff5b5b',
  }
  return map[grade] ?? '#9b6dff'
}

function trendIcon(trend) {
  if (trend === 'improving') return '↑'
  if (trend === 'declining') return '↓'
  return '→'
}

// ─── SVG Semicircle Gauge ────────────────────────────────────────────────────

function SemiGauge({ value, max = 100, color, size = 220 }) {
  const radius = 80
  const cx = size / 2
  const cy = size / 2
  const circumference = Math.PI * radius // half circle
  const pct = Math.min(1, Math.max(0, value / max))
  const offset = circumference * (1 - pct)

  const startX = cx - radius
  const startY = cy
  const endX = cx + radius
  const endY = cy

  const arcPath = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`

  return (
    <svg width={size} height={size / 2 + 40} viewBox={`0 0 ${size} ${size / 2 + 40}`}>
      {/* Background track */}
      <path
        d={arcPath}
        fill="none"
        stroke="#1e1e2a"
        strokeWidth={14}
        strokeLinecap="round"
      />
      {/* Filled arc */}
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
      {/* Center value */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={38}
        fontWeight={700}
        fontFamily="inherit"
      >
        {value}%
      </text>
    </svg>
  )
}

// ─── Stat Box ────────────────────────────────────────────────────────────────

function StatBox({ label, value, unit = '', color = '#9b6dff' }) {
  return (
    <div
      style={{
        background: '#0d0d14',
        border: '1px solid #1e1e2a',
        borderRadius: 12,
        padding: '16px 20px',
        textAlign: 'center',
        flex: 1,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}{unit}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{label}</div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ScorePredictor() {
  const userId = useAppStore(s => s.auth.user?.uid ?? null)

  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState('')
  const [examDate, setExamDate] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [whatIfHours, setWhatIfHours] = useState(0)
  const [plansLoading, setPlansLoading] = useState(false)

  // ── Fetch plans on mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return
    setPlansLoading(true)
    studyPlanAIAPI.list(userId)
      .then(({ data }) => {
        const list = data.plans ?? []
        setPlans(list)
        if (list.length > 0) setSelectedPlan(list[0].id)
      })
      .catch(() => {})
      .finally(() => setPlansLoading(false))
  }, [userId])

  // ── Predict ───────────────────────────────────────────────────────────────
  const handlePredict = useCallback(async () => {
    if (!selectedPlan || !examDate) {
      setError('Please select a study plan and exam date.')
      return
    }
    setError('')
    setLoading(true)
    setPrediction(null)
    try {
      const { data } = await scorePredictorAPI.predict({ planId: selectedPlan, examDate, userId })
      setPrediction(data)
      setWhatIfHours(0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedPlan, examDate, userId])

  // ── Derived what-if score ─────────────────────────────────────────────────
  const whatIfScore = (() => {
    if (!prediction) return null
    if (whatIfHours === 0) return prediction.predicted_score
    const scenario = prediction.whatif_scenarios?.find(
      s => s.extra_hours === whatIfHours,
    )
    return scenario?.new_score ?? Math.min(100, prediction.predicted_score + whatIfHours * 4)
  })()

  // ── Radar data ────────────────────────────────────────────────────────────
  const radarData = (prediction?.topic_predictions ?? []).map(tp => ({
    subject: tp.topic.length > 14 ? tp.topic.slice(0, 14) + '…' : tp.topic,
    mastery: tp.current_mastery,
    predicted: tp.predicted_score,
  }))

  // ── Today string for min date ─────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>🎯</span>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#fff' }}>
            Score Predictor
          </h1>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          AI-powered exam score prediction based on your study progress, test performance,
          and days remaining.
        </p>
      </div>

      {/* ── Config Card ── */}
      <div
        style={{
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16,
          padding: '24px 28px',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          {/* Plan selector */}
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#9b6dff', fontWeight: 600, marginBottom: 8 }}>
              STUDY PLAN
            </label>
            <select
              value={selectedPlan}
              onChange={e => setSelectedPlan(e.target.value)}
              disabled={plansLoading}
              style={{
                width: '100%',
                background: '#0d0d14',
                border: '1px solid #1e1e2a',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {plansLoading && <option>Loading plans…</option>}
              {!plansLoading && plans.length === 0 && (
                <option value="">No plans found</option>
              )}
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.topic ?? p.id} ({p.duration_weeks}w)
                </option>
              ))}
            </select>
          </div>

          {/* Exam date */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#9b6dff', fontWeight: 600, marginBottom: 8 }}>
              EXAM DATE
            </label>
            <input
              type="date"
              value={examDate}
              min={todayStr}
              onChange={e => setExamDate(e.target.value)}
              style={{
                width: '100%',
                background: '#0d0d14',
                border: '1px solid #1e1e2a',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#fff',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Predict button */}
          <div>
            <button
              onClick={handlePredict}
              disabled={loading || !selectedPlan || !examDate}
              style={{
                padding: '11px 28px',
                background: loading ? '#3a2a6e' : '#9b6dff',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? '⏳ Predicting…' : '🎯 Predict Score'}
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              background: '#1f0a0a',
              border: '1px solid #ff5b5b44',
              borderRadius: 8,
              color: '#ff5b5b',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── Result Panel ── */}
      {prediction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Row 1: Gauge + Grade + Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 2fr',
              gap: 20,
            }}
          >
            {/* Score Gauge */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                PREDICTED SCORE
              </div>
              <SemiGauge
                value={prediction.predicted_score}
                color={scoreColor(prediction.predicted_score)}
              />
              <div style={{ fontSize: 12, color: '#555', textAlign: 'center' }}>
                Likely between{' '}
                <span style={{ color: '#9b6dff' }}>{prediction.confidence_low}%</span>
                {' – '}
                <span style={{ color: '#9b6dff' }}>{prediction.confidence_high}%</span>
              </div>
            </div>

            {/* Grade Badge */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '24px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888' }}>
                GRADE PREDICTION
              </div>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 900,
                  color: gradeColor(prediction.grade_prediction),
                  lineHeight: 1,
                  textShadow: `0 0 32px ${gradeColor(prediction.grade_prediction)}55`,
                }}
              >
                {prediction.grade_prediction}
              </div>
              <div
                style={{
                  padding: '4px 14px',
                  background: `${gradeColor(prediction.grade_prediction)}22`,
                  border: `1px solid ${gradeColor(prediction.grade_prediction)}55`,
                  borderRadius: 20,
                  color: gradeColor(prediction.grade_prediction),
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {prediction.grade_prediction === 'O'
                  ? 'Outstanding'
                  : prediction.grade_prediction === 'A+'
                  ? 'Excellent'
                  : prediction.grade_prediction === 'A'
                  ? 'Very Good'
                  : prediction.grade_prediction === 'B+'
                  ? 'Good'
                  : prediction.grade_prediction === 'B'
                  ? 'Above Average'
                  : 'Needs Work'}
              </div>
            </div>

            {/* 3-stat column */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                PERFORMANCE SNAPSHOT
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <StatBox
                  label="Days Remaining"
                  value={prediction.days_remaining}
                  color={prediction.days_remaining < 7 ? '#ff5b5b' : '#9b6dff'}
                />
                <StatBox
                  label="Completion Rate"
                  value={prediction.completion_rate}
                  unit="%"
                  color={prediction.completion_rate > 60 ? '#5bff9b' : '#ffdb5b'}
                />
                <StatBox
                  label="Avg Test Score"
                  value={prediction.avg_test_score.toFixed(1)}
                  unit="%"
                  color={scoreColor(prediction.avg_test_score)}
                />
              </div>

              {/* Daily target */}
              <div
                style={{
                  marginTop: 8,
                  padding: '12px 16px',
                  background: '#1a1228',
                  border: '1px solid #9b6dff44',
                  borderLeft: '3px solid #9b6dff',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📌</span>
                <div>
                  <div style={{ fontSize: 11, color: '#9b6dff', fontWeight: 700, marginBottom: 2 }}>
                    DAILY TARGET
                  </div>
                  <div style={{ fontSize: 13, color: '#ddd' }}>{prediction.daily_target}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Radar chart + Topics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Radar chart */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 12 }}>
                📊 TOPIC MASTERY RADAR
              </div>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="#1e1e2a" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: '#888', fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: '#555', fontSize: 9 }}
                    />
                    <Radar
                      name="Mastery"
                      dataKey="mastery"
                      stroke="#9b6dff"
                      fill="#9b6dff"
                      fillOpacity={0.25}
                    />
                    <Radar
                      name="Predicted"
                      dataKey="predicted"
                      stroke="#5bff9b"
                      fill="#5bff9b"
                      fillOpacity={0.15}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#14121a',
                        border: '1px solid #1e1e2a',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 12,
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: '#555', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>
                  No topic data available
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
                  <div style={{ width: 10, height: 10, background: '#9b6dff', borderRadius: 2 }} />
                  Current Mastery
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
                  <div style={{ width: 10, height: 10, background: '#5bff9b', borderRadius: 2 }} />
                  Predicted Score
                </div>
              </div>
            </div>

            {/* Topic predictions list */}
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
                📚 TOPIC BREAKDOWN
              </div>
              {(prediction.topic_predictions ?? []).map((tp, i) => (
                <div
                  key={i}
                  style={{
                    background: '#0d0d14',
                    border: '1px solid #1e1e2a',
                    borderRadius: 10,
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{tp.topic}</span>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 20,
                        background:
                          tp.weight === 'high'
                            ? '#ff5b5b22'
                            : tp.weight === 'medium'
                            ? '#ffdb5b22'
                            : '#5bff9b22',
                        color:
                          tp.weight === 'high'
                            ? '#ff5b5b'
                            : tp.weight === 'medium'
                            ? '#ffdb5b'
                            : '#5bff9b',
                        border: `1px solid ${
                          tp.weight === 'high'
                            ? '#ff5b5b44'
                            : tp.weight === 'medium'
                            ? '#ffdb5b44'
                            : '#5bff9b44'
                        }`,
                        textTransform: 'uppercase',
                      }}
                    >
                      {tp.weight}
                    </span>
                  </div>
                  {/* Progress bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#555', width: 56 }}>Mastery</span>
                      <div style={{ flex: 1, height: 4, background: '#1e1e2a', borderRadius: 4 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${tp.current_mastery}%`,
                            background: '#9b6dff',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: '#888', width: 28, textAlign: 'right' }}>
                        {tp.current_mastery}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#555', width: 56 }}>Predicted</span>
                      <div style={{ flex: 1, height: 4, background: '#1e1e2a', borderRadius: 4 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${tp.predicted_score}%`,
                            background: scoreColor(tp.predicted_score),
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 10, color: '#888', width: 28, textAlign: 'right' }}>
                        {tp.predicted_score}%
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>
                    {tp.action}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Critical topics + Skip topics */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Critical topics */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#ff5b5b',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                ⚠ CRITICAL TOPICS — Study Immediately
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(prediction.critical_topics ?? []).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      background: '#1f0a0a',
                      border: '1px solid #ff5b5b33',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <span style={{ color: '#ff5b5b', fontSize: 16 }}>⚠</span>
                    <span style={{ color: '#ffd5d5', fontSize: 13, fontWeight: 500 }}>{t}</span>
                  </div>
                ))}
                {!prediction.critical_topics?.length && (
                  <div style={{ color: '#555', fontSize: 13 }}>
                    ✅ No critical topics identified
                  </div>
                )}
              </div>
            </div>

            {/* Skip topics */}
            <div
              style={{
                background: '#14121a',
                border: '1px solid #1e1e2a',
                borderRadius: 16,
                padding: '20px',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#666',
                  marginBottom: 12,
                }}
              >
                🚫 LOW PRIORITY — Can Skip
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(prediction.skip_topics ?? []).map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px',
                      background: '#0d0d14',
                      border: '1px solid #1e1e2a',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      opacity: 0.65,
                    }}
                  >
                    <span style={{ color: '#555', fontSize: 16 }}>—</span>
                    <span style={{ color: '#888', fontSize: 13 }}>{t}</span>
                  </div>
                ))}
                {!prediction.skip_topics?.length && (
                  <div style={{ color: '#555', fontSize: 13 }}>
                    All topics are relevant for your exam.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 4: What-If Slider */}
          <div
            style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 16,
              padding: '24px 28px',
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#9b6dff',
                marginBottom: 16,
              }}
            >
              🔮 WHAT-IF SCENARIO
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>
                  What if I study{' '}
                  <span style={{ color: '#9b6dff', fontWeight: 700 }}>
                    +{whatIfHours} extra hour{whatIfHours !== 1 ? 's' : ''}/day
                  </span>
                  ?
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={whatIfHours}
                  onChange={e => setWhatIfHours(Number(e.target.value))}
                  style={{
                    width: '100%',
                    accentColor: '#9b6dff',
                    cursor: 'pointer',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: '#555',
                    marginTop: 4,
                  }}
                >
                  <span>+0h (base)</span>
                  <span>+1h</span>
                  <span>+2h</span>
                  <span>+3h</span>
                </div>
              </div>

              {/* Result bubble */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 900,
                    color: scoreColor(whatIfScore ?? 0),
                    lineHeight: 1,
                    textShadow: `0 0 24px ${scoreColor(whatIfScore ?? 0)}55`,
                  }}
                >
                  {whatIfScore}%
                </div>
                <div style={{ fontSize: 12, color: '#555' }}>Projected score</div>
              </div>

              {/* Scenario tiles */}
              <div style={{ display: 'flex', gap: 10 }}>
                {(prediction.whatif_scenarios ?? []).map(s => (
                  <div
                    key={s.extra_hours}
                    onClick={() => setWhatIfHours(s.extra_hours)}
                    style={{
                      padding: '10px 16px',
                      background:
                        whatIfHours === s.extra_hours ? '#1a1228' : '#0d0d14',
                      border: `1px solid ${
                        whatIfHours === s.extra_hours ? '#9b6dff' : '#1e1e2a'
                      }`,
                      borderRadius: 10,
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: scoreColor(s.new_score),
                      }}
                    >
                      {s.new_score}%
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      +{s.extra_hours}h/day
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 5: Motivation Card */}
          <div
            style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderLeft: '4px solid #9b6dff',
              borderRadius: 16,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              boxShadow: '0 0 32px #9b6dff12',
            }}
          >
            <span style={{ fontSize: 24 }}>💜</span>
            <div>
              <div style={{ fontSize: 12, color: '#9b6dff', fontWeight: 700, marginBottom: 6 }}>
                A WORD FROM YOUR STUDY BUDDY
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 15,
                  color: '#d4c8ff',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                }}
              >
                {prediction.motivation_message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!prediction && !loading && (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: '#444',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginBottom: 8 }}>
            Ready to predict your score?
          </div>
          <div style={{ fontSize: 13 }}>
            Select a study plan and your exam date above, then click{' '}
            <strong style={{ color: '#9b6dff' }}>Predict Score</strong>.
          </div>
        </div>
      )}
    </div>
  )
}

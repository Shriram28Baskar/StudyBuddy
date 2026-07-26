import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import useAppStore from '@/store/useAppStore'
import { studyPlanAIAPI } from '../services/api'

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function fmt(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function buildScoreByWeek(plan) {
  const map = {}
  const scores = plan.progress?.test_scores ?? []
  for (const entry of scores) {
    const pct = entry.total > 0
      ? Math.round((entry.score / entry.total) * 100)
      : Math.round(entry.score ?? 0)
    map[entry.week] = pct
  }
  return map
}

function buildCompletionByWeek(plan) {
  const tasks = plan.progress?.completed_tasks ?? {}
  const weeks = plan.weeks ?? []
  return weeks.map((w, i) => {
    let total = 0
    let done = 0
    Object.entries(w.daily_tasks || {}).forEach(([day, dTasks]) => {
      dTasks.forEach((_, ti) => {
        total++
        if (tasks[`w${i}_${day}_${ti}`]) done++
      })
    })
    return {
      week: i + 1,
      completion: total > 0 ? Math.round((done / total) * 100) : 0,
    }
  })
}

function getProgressBarColor(pct) {
  if (pct > 70) return '#5bff9b'
  if (pct > 40) return '#ffd55b'
  return '#ff5b5b'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonCards() {
  return (
    <>
      <style>{`@keyframes skPulse { 0%,100%{opacity:.35} 50%{opacity:.7} }`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 110, background: '#14121a', borderRadius: 12, animation: 'skPulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 80, background: '#14121a', borderRadius: 10, animation: 'skPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <div style={{ height: 300, background: '#14121a', borderRadius: 12, animation: 'skPulse 1.5s ease-in-out infinite' }} />
      </div>
    </>
  )
}

function SummaryCard({ icon, label, value }) {
  return (
    <div style={{
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 12,
      padding: 20,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#e8e4f0' }}>
          {value}
        </div>
      </div>
      <div style={{ fontSize: 28, opacity: 0.8 }}>{icon}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#14121a', border: '1px solid #2a2a38', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 13, color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}%
        </div>
      ))}
    </div>
  )
}

function PlanCard({ plan, isSelected, onClick }) {
  const completion = Math.round(plan.completion_percentage ?? 0)
  const avgScore = Math.round(plan.avg_test_score ?? 0)

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#1a1428' : '#14121a',
        border: `1px solid ${isSelected ? '#9b6dff' : '#1e1e2a'}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#2a2a38' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = '#1e1e2a' }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e4f0', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {plan.topic}
      </div>
      <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
        {plan.duration_weeks} weeks · {fmt(plan.created_at)}
      </div>

      {/* Mini progress bar */}
      <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, marginBottom: 8 }}>
        <div style={{
          width: `${completion}%`,
          height: '100%',
          background: '#9b6dff',
          borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#888' }}>{completion}% complete</span>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#9b6dff',
          background: '#9b6dff18',
          padding: '2px 8px',
          borderRadius: 6,
        }}>
          {avgScore}% score
        </span>
      </div>
    </div>
  )
}

function PlanAnalytics({ plan }) {
  const durationWk = plan.duration_weeks ?? plan.weeks?.length ?? 0
  const scoreByWeek = buildScoreByWeek(plan)
  const completionByWk = buildCompletionByWeek(plan)

  const combinedChart = useMemo(() =>
    Array.from({ length: durationWk }, (_, i) => ({
      name: `Week ${i + 1}`,
      'Test Score': scoreByWeek[i + 1] ?? 0,
      'Completion': completionByWk[i]?.completion ?? 0,
    })),
    [durationWk, scoreByWeek, completionByWk]
  )

  const barData = useMemo(() =>
    Array.from({ length: durationWk }, (_, i) => ({
      name: `Week ${i + 1}`,
      'Test Score': scoreByWeek[i + 1] ?? 0,
    })),
    [durationWk, scoreByWeek]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Plan header */}
      <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '18px 22px' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e4f0', marginBottom: 6 }}>
          {plan.topic}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
          <span style={{ color: '#555' }}>{durationWk} weeks</span>
          <span style={{ color: '#9b6dff', fontWeight: 600 }}>{plan.test_count ?? 0} tests taken</span>
          <span style={{ color: '#5bff9b', fontWeight: 600 }}>{Math.round(plan.completion_percentage ?? 0)}% complete</span>
          <span style={{ color: '#5bbdff', fontWeight: 600 }}>Avg score: {Math.round(plan.avg_test_score ?? 0)}%</span>
          <span style={{ color: '#555' }}>Created {fmt(plan.created_at)}</span>
        </div>
      </div>

      {/* Combined Line Chart */}
      <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e4f0', marginBottom: 4 }}>Performance Overview</div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 20 }}>Test scores and task completion per week</div>
        {combinedChart.some(d => d['Test Score'] > 0 || d['Completion'] > 0) ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={combinedChart} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
              <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#555', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={v => <span style={{ color: '#888', fontSize: 11 }}>{v}</span>} />
              <Line
                type="monotone"
                dataKey="Test Score"
                stroke="#9b6dff"
                strokeWidth={2.5}
                dot={{ fill: '#9b6dff', r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="Completion"
                stroke="#5bff9b"
                strokeWidth={2.5}
                dot={{ fill: '#5bff9b', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#444' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📈</div>
            <div style={{ fontSize: 13 }}>No data yet — complete tests and tasks to see charts</div>
          </div>
        )}
      </div>

      {/* Bar Chart — Test Scores */}
      <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e4f0', marginBottom: 4 }}>Weekly Test Scores</div>
        <div style={{ fontSize: 11, color: '#555', marginBottom: 20 }}>Your performance on weekly assessments</div>
        {barData.some(d => d['Test Score'] > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
              <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#555', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="Test Score"
                fill="#9b6dff"
                radius={[4, 4, 0, 0]}
                label={{ position: 'top', fill: '#666', fontSize: 10, formatter: v => v > 0 ? `${v}%` : '' }}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 0', color: '#444' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 13 }}>No test scores yet</div>
          </div>
        )}
      </div>

      {/* Week-by-week progress bars */}
      <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#e8e4f0', marginBottom: 16 }}>Week-by-Week Progress</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {completionByWk.map(({ week, completion }) => (
            <div key={week} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 60, fontSize: 12, color: '#888', flexShrink: 0 }}>Week {week}</div>
              <div style={{ flex: 1, height: 8, background: '#1e1e2a', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${completion}%`,
                  height: '100%',
                  background: getProgressBarColor(completion),
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{
                width: 42,
                fontSize: 12,
                fontWeight: 600,
                color: completion > 0 ? getProgressBarColor(completion) : '#333',
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {completion > 0 ? `${completion}%` : '—'}
              </div>
            </div>
          ))}
          {completionByWk.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#444', fontSize: 13 }}>
              No week data available
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function ProgressDashboard() {
  const navigate = useNavigate()
  const userId = useAppStore(s => s.auth.user?.uid ?? null)

  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    setLoading(true)
    setError(null)

    studyPlanAIAPI.list(userId)
      .then(({ data }) => {
        const fetched = data.plans ?? []
        setPlans(fetched)
        if (fetched.length > 0) setSelectedPlan(fetched[0])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  // Aggregate stats
  const stats = useMemo(() => {
    if (plans.length === 0) return { totalPlans: 0, avgScore: 0, avgCompletion: 0, totalTests: 0 }

    const totalPlans = plans.length
    const avgScore = Math.round(plans.reduce((sum, p) => sum + (p.avg_test_score ?? 0), 0) / totalPlans)
    const avgCompletion = Math.round(plans.reduce((sum, p) => sum + (p.completion_percentage ?? 0), 0) / totalPlans)
    const totalTests = plans.reduce((sum, p) => sum + (p.test_count ?? 0), 0)

    return { totalPlans, avgScore, avgCompletion, totalTests }
  }, [plans])

  // ── Not signed in ──
  if (!userId) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, color: '#e8e4f0', marginBottom: 8 }}>Sign in to continue</div>
        <div style={{ fontSize: 13, color: '#555' }}>You need to be logged in to view your progress dashboard.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', animation: 'fadeUp 0.25s ease-out' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes skPulse { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>
          Progress Dashboard
        </h1>
        <p style={{ color: '#555', fontSize: 13, margin: 0 }}>Analytics across all your study plans.</p>
      </div>

      {/* Loading state */}
      {loading && <SkeletonCards />}

      {/* Error banner */}
      {!loading && error && (
        <div style={{
          background: '#1a1010',
          border: '1px solid #4d1515',
          borderRadius: 10,
          padding: '14px 18px',
          color: '#ff6b6b',
          fontSize: 13,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
            <SummaryCard icon="📚" label="Total Plans" value={stats.totalPlans} />
            <SummaryCard icon="📝" label="Avg Test Score" value={`${stats.avgScore}%`} />
            <SummaryCard icon="✅" label="Avg Completion" value={`${stats.avgCompletion}%`} />
            <SummaryCard icon="🎯" label="Tests Taken" value={stats.totalTests} />
          </div>

          {plans.length === 0 ? (
            /* Empty state */
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 16, color: '#888', marginBottom: 8 }}>No study plans yet</div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
                Generate a study plan and start tracking your progress.
              </div>
              <button
                onClick={() => navigate('/studyplan/ai')}
                style={{
                  background: '#5c35aa',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 28px',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#7b4fd4'}
                onMouseLeave={e => e.currentTarget.style.background = '#5c35aa'}
              >
                Create Study Plan →
              </button>
            </div>
          ) : (
            /* Two-column layout */
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

              {/* Left Panel — Plan Selector */}
              <div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e8e4f0' }}>Your Plans</div>
                  <div style={{
                    fontSize: 11,
                    color: '#9b6dff',
                    background: '#9b6dff18',
                    padding: '2px 10px',
                    borderRadius: 10,
                    fontWeight: 600,
                  }}>
                    {plans.length}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  maxHeight: 'calc(100vh - 340px)',
                  overflowY: 'auto',
                  paddingRight: 4,
                }}>
                  {plans.map(plan => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isSelected={selectedPlan?.id === plan.id}
                      onClick={() => setSelectedPlan(plan)}
                    />
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => selectedPlan && navigate(`/studyplan/${selectedPlan.id}`)}
                    disabled={!selectedPlan}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: '1px solid #2a2a38',
                      borderRadius: 8,
                      padding: 10,
                      color: '#9b6dff',
                      fontSize: 12,
                      cursor: selectedPlan ? 'pointer' : 'not-allowed',
                      opacity: selectedPlan ? 1 : 0.4,
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => { if (selectedPlan) e.currentTarget.style.borderColor = '#5c35aa' }}
                    onMouseLeave={e => { if (selectedPlan) e.currentTarget.style.borderColor = '#2a2a38' }}
                  >
                    Open Full Plan →
                  </button>
                  <button
                    onClick={() => navigate('/studyplan/ai')}
                    style={{
                      width: '100%',
                      background: '#1a1428',
                      border: '1px solid #2a1f40',
                      borderRadius: 8,
                      padding: 10,
                      color: '#c4a8ff',
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#221a36'}
                    onMouseLeave={e => e.currentTarget.style.background = '#1a1428'}
                  >
                    + New Plan
                  </button>
                </div>
              </div>

              {/* Right Panel — Analytics */}
              {selectedPlan ? (
                <PlanAnalytics plan={selectedPlan} />
              ) : (
                <div style={{ textAlign: 'center', padding: '80px 20px', color: '#444' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>👈</div>
                  <div style={{ fontSize: 13 }}>Select a plan to see its progress</div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
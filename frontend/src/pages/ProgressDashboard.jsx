import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { studyPlansDB } from '@/services/firestore'

// ── Helpers ───────────────────────────────────────────────────────────
function fmt(date) {
  if (!date) return ''
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' })
}

// ── Summary card ──────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        <div style={{ width:36, height:36, borderRadius:8, background:`${color}14`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{icon}</div>
        <span style={{ fontSize:12, color:'#555', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:700, color, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#555' }}>{sub}</div>}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#14121a', border:'1px solid #2a2a38', borderRadius:8, padding:'10px 14px' }}>
      <div style={{ fontSize:11, color:'#555', marginBottom:6 }}>Week {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize:13, color:p.color, fontWeight:600 }}>{p.name}: {p.value}%</div>
      ))}
    </div>
  )
}

// ── Plan card in the left sidebar ─────────────────────────────────────
function PlanCard({ plan, isSelected, onClick }) {
  // Derive per-plan stats from saved scores map  { week_0: {pct,correct,...}, ... }
  const scoresMap   = plan.scores ?? {}
  const scoreValues = Object.values(scoresMap).map(s => s.pct ?? s.score ?? 0)
  const avgScore    = scoreValues.length > 0
    ? Math.round(scoreValues.reduce((a, v) => a + v, 0) / scoreValues.length)
    : 0

  // completion from task progress map
  const progressMap  = plan.progress ?? {}
  const totalTasks   = Object.keys(progressMap).length
  const doneTasks    = Object.values(progressMap).filter(Boolean).length
  const completion   = plan.completion_pct != null
    ? Math.round(plan.completion_pct)
    : totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? '#1a1428' : '#14121a',
        border: `1px solid ${isSelected ? '#5c35aa' : '#1e1e2a'}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#2a2a38' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = '#1e1e2a' }}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:500, color:'#ddd', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {plan.topic}
          </div>
          <div style={{ fontSize:11, color:'#555' }}>
            {plan.duration_weeks ?? plan.weeks?.length ?? '?'}w · {fmt(plan.createdAt)}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexShrink:0, marginLeft:8 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#9b6dff' }}>{avgScore}%</span>
          <span style={{ fontSize:12, fontWeight:700, color:'#5bff9b' }}>{completion}%</span>
        </div>
      </div>
      <div style={{ height:3, background:'#1e1e2a', borderRadius:2, marginTop:10 }}>
        <div style={{ width:`${completion}%`, height:'100%', background:'#9b6dff', borderRadius:2 }} />
      </div>
    </div>
  )
}

// ── No-plans empty state ──────────────────────────────────────────────
function EmptyState({ onNavigate }) {
  return (
    <div style={{ textAlign:'center', padding:'60px 0' }}>
      <div style={{ fontSize:40, marginBottom:16 }}>📊</div>
      <div style={{ fontSize:15, color:'#888', marginBottom:8 }}>No study plans yet</div>
      <div style={{ fontSize:13, color:'#555', marginBottom:24 }}>
        Generate a study plan and complete weekly tests to start tracking progress
      </div>
      <button
        onClick={onNavigate}
        style={{ background:'#5c35aa', border:'none', borderRadius:8, padding:'10px 24px', color:'#fff', fontSize:13, cursor:'pointer' }}
      >
        Create Study Plan
      </button>
    </div>
  )
}

// ── Right panel: charts for selected plan ────────────────────────────
function PlanCharts({ plan }) {
  const scoresMap  = plan.scores ?? {}
  const durationWk = plan.duration_weeks ?? plan.weeks?.length ?? 0

  // Build per-week score array from the scores map (keys: "week_0", "week_1", …)
  const weeklyScores = Array.from({ length: durationWk }, (_, i) => {
    const entry = scoresMap[`week_${i}`]
    return { week: i + 1, score: entry ? Math.round(entry.pct ?? entry.score ?? 0) : 0 }
  })

  // Build completion series from progress map
  const progressMap = plan.progress ?? {}
  const progressKeys = Object.keys(progressMap)
  const weeklyCompletion = Array.from({ length: durationWk }, (_, i) => {
    const weekKeys = progressKeys.filter(k => k.startsWith(`w${i}_`))
    const done     = weekKeys.filter(k => progressMap[k]).length
    return {
      week:       i + 1,
      completion: weekKeys.length > 0 ? Math.round((done / weekKeys.length) * 100) : 0,
    }
  })

  const combinedChart = Array.from({ length: durationWk }, (_, i) => ({
    week:       i + 1,
    score:      weeklyScores[i]?.score ?? 0,
    completion: weeklyCompletion[i]?.completion ?? 0,
  }))

  const hasData = combinedChart.some(d => d.score > 0 || d.completion > 0)

  const scoresMap2 = plan.scores ?? {}
  const avgScore = (() => {
    const vals = Object.values(scoresMap2).map(s => s.pct ?? s.score ?? 0)
    return vals.length > 0 ? Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) : 0
  })()

  const progressKeys2 = Object.keys(progressMap)
  const donePct = progressKeys2.length > 0
    ? Math.round((progressKeys2.filter(k => progressMap[k]).length / progressKeys2.length) * 100)
    : (plan.completion_pct != null ? Math.round(plan.completion_pct) : 0)

  const testsCompleted = Object.keys(scoresMap2).length

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* Plan header */}
      <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'16px 20px' }}>
        <div style={{ fontSize:16, fontWeight:500, color:'#e8e4f0', marginBottom:8 }}>{plan.topic}</div>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#555' }}>{durationWk} weeks</span>
          <span style={{ fontSize:12, color:'#9b6dff', fontWeight:600 }}>{testsCompleted} tests completed</span>
          <span style={{ fontSize:12, color:'#5bff9b', fontWeight:600 }}>{donePct}% tasks done</span>
          <span style={{ fontSize:12, color:'#5bbdff', fontWeight:600 }}>Avg score: {avgScore}%</span>
          <span style={{ fontSize:12, color:'#555' }}>Created {fmt(plan.createdAt)}</span>
        </div>
      </div>

      {/* Combined line chart */}
      <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#ccc', marginBottom:4 }}>Weekly Test Performance</div>
        <div style={{ fontSize:11, color:'#555', marginBottom:20 }}>Your scores on weekly assessments</div>
        {hasData ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={combinedChart} margin={{ top:5, right:10, bottom:5, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
              <XAxis dataKey="week" tick={{ fill:'#555', fontSize:11 }} tickFormatter={v => `Week ${v}`} />
              <YAxis domain={[0, 100]} tick={{ fill:'#555', fontSize:11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend formatter={v => <span style={{ color:'#888', fontSize:11 }}>{v}</span>} />
              <Line type="monotone" dataKey="score"      name="Test Score"  stroke="#9b6dff" strokeWidth={2.5} dot={{ fill:'#9b6dff', r:4 }} activeDot={{ r:6 }} />
              <Line type="monotone" dataKey="completion" name="Completion"  stroke="#5bff9b" strokeWidth={2.5} dot={{ fill:'#5bff9b', r:4 }} activeDot={{ r:6 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign:'center', padding:'32px 0', color:'#444' }}>
            <div style={{ fontSize:22, marginBottom:8 }}>📈</div>
            <div style={{ fontSize:13 }}>No test data yet</div>
            <div style={{ fontSize:11, marginTop:4, color:'#333' }}>Complete weekly tests in your plan to see charts</div>
          </div>
        )}
      </div>

      {/* Weekly plan completion bar chart */}
      <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#ccc', marginBottom:4 }}>Weekly Plan Completion</div>
        <div style={{ fontSize:11, color:'#555', marginBottom:20 }}>Your consistency in following study plans</div>
        {weeklyCompletion.some(d => d.completion > 0) ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyCompletion} margin={{ top:5, right:10, bottom:5, left:-20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
              <XAxis dataKey="week" tick={{ fill:'#555', fontSize:11 }} tickFormatter={v => `Week ${v}`} />
              <YAxis domain={[0, 100]} tick={{ fill:'#555', fontSize:11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="completion" name="Completion" fill="#ff9b5b" radius={[4, 4, 0, 0]}
                label={{ position:'top', fill:'#666', fontSize:10, formatter: v => v > 0 ? `${v}%` : '' }} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign:'center', padding:'32px 0', color:'#444' }}>
            <div style={{ fontSize:22, marginBottom:8 }}>📋</div>
            <div style={{ fontSize:13 }}>No tasks completed yet</div>
            <div style={{ fontSize:11, marginTop:4, color:'#333' }}>Check off daily tasks in your plan to see completion data</div>
          </div>
        )}
      </div>

      {/* Per-week score breakdown */}
      <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#ccc', marginBottom:16 }}>Week Breakdown</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {weeklyScores.map((ws, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:54, fontSize:11, color:'#555', flexShrink:0 }}>Week {ws.week}</div>
              <div style={{ flex:1, height:6, background:'#1e1e2a', borderRadius:3, overflow:'hidden' }}>
                <div style={{ width:`${ws.score}%`, height:'100%', background:'#9b6dff', borderRadius:3, transition:'width 0.4s ease' }} />
              </div>
              <div style={{ width:38, fontSize:11, color: ws.score > 0 ? '#9b6dff' : '#333', textAlign:'right', flexShrink:0 }}>
                {ws.score > 0 ? `${ws.score}%` : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────
export default function ProgressDashboard() {
  const navigate   = useNavigate()
  const userId     = useAppStore(s => s.auth.user?.uid ?? null)

  const [plans,        setPlans]        = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  // Fetch all study plans for this user from Firestore
  useEffect(() => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    studyPlansDB.getAll(userId)
      .then(ps => {
        setPlans(ps)
        if (ps.length > 0) setSelectedPlan(ps[0])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  // ── Aggregate stats across all plans ──────────────────────────────
  const { avgTestScore, avgCompletion, totalTests } = (() => {
    if (plans.length === 0) return { avgTestScore: 0, avgCompletion: 0, totalTests: 0 }

    let allScores = []
    let totalCompletion = 0

    for (const p of plans) {
      const scoresMap = p.scores ?? {}
      const vals = Object.values(scoresMap).map(s => s.pct ?? s.score ?? 0)
      allScores = allScores.concat(vals)

      const progressMap = p.progress ?? {}
      const keys = Object.keys(progressMap)
      const done = keys.filter(k => progressMap[k]).length
      const pct  = keys.length > 0 ? (done / keys.length) * 100
                  : (p.completion_pct ?? 0)
      totalCompletion += pct
    }

    return {
      avgTestScore:  allScores.length > 0 ? Math.round(allScores.reduce((a, v) => a + v, 0) / allScores.length) : 0,
      avgCompletion: Math.round(totalCompletion / plans.length),
      totalTests:    allScores.length,
    }
  })()

  // ── Guard: not signed in ──────────────────────────────────────────
  if (!userId) return (
    <div style={{ maxWidth:960, textAlign:'center', padding:'60px 0' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
      <div style={{ fontSize:14, color:'#888' }}>Sign in to view your progress dashboard</div>
    </div>
  )

  return (
    <div style={{ maxWidth:1060, animation:'fadeUp 0.2s ease-out' }}>
      <style>{`
        @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse   { 0%,100%{opacity:.4} 50%{opacity:.8} }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom:28 }}>
        <h1 style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontWeight:400, fontSize:28, color:'#e8e4f0', marginBottom:4 }}>
          Progress Dashboard
        </h1>
        <p style={{ color:'#555', fontSize:13 }}>Analytics across all your study plans.</p>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height:100, background:'#14121a', borderRadius:12, animation:'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ background:'#1a1010', border:'1px solid #4d1515', borderRadius:10, padding:16, color:'#ff9b5b', fontSize:13, marginBottom:24 }}>
          ⚠ {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
            <SummaryCard icon="📚" label="Study Plans"    value={plans.length}         sub="Generated"          color="#9b6dff" />
            <SummaryCard icon="🎯" label="Avg Test Score" value={`${avgTestScore}%`}   sub="Across all plans"   color="#5bbdff" />
            <SummaryCard icon="✅" label="Avg Completion" value={`${avgCompletion}%`}  sub="Tasks completed"    color="#ff9b5b" />
            <SummaryCard icon="📝" label="Tests Taken"    value={totalTests}           sub="Weekly quizzes"     color="#ffdb5b" />
          </div>

          {plans.length === 0 ? (
            <EmptyState onNavigate={() => navigate('/studyplan/ai')} />
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'290px 1fr', gap:20, alignItems:'start' }}>

              {/* Left: Study Plans list */}
              <div>
                <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>
                  Your Study Plans
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:12 }}>
                  <button
                    onClick={() => selectedPlan && navigate(`/studyplan/${selectedPlan.id}`)}
                    disabled={!selectedPlan}
                    style={{ width:'100%', background:'none', border:'1px solid #2a2a38', borderRadius:8, padding:9, color:'#9b6dff', fontSize:12, cursor: selectedPlan ? 'pointer' : 'not-allowed', opacity: selectedPlan ? 1 : 0.4 }}
                  >
                    Open Full Plan →
                  </button>
                  <button
                    onClick={() => navigate('/studyplan/ai')}
                    style={{ width:'100%', background:'#1a1428', border:'1px solid #2a1f40', borderRadius:8, padding:9, color:'#c4a8ff', fontSize:12, cursor:'pointer' }}
                  >
                    + New Plan
                  </button>
                </div>
              </div>

              {/* Right: Charts for selected plan */}
              {selectedPlan
                ? <PlanCharts plan={selectedPlan} />
                : (
                  <div style={{ textAlign:'center', padding:'60px 20px', color:'#444' }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>👈</div>
                    <div style={{ fontSize:13 }}>Select a plan to see its progress</div>
                  </div>
                )
              }
            </div>
          )}
        </>
      )}
    </div>
  )
}
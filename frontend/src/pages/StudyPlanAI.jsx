import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const WEEK_COLORS   = ['#9b6dff','#5bbdff','#ff9b5b','#5bff9b','#ff5b9b','#ffdb5b','#5bdfff','#ff6b6b','#a8ff78','#ffd89b','#96fbc4','#f093fb']
const PRIORITY_COLOR = { high:'#ff5b5b', medium:'#ffdb5b', low:'#5bff9b' }
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const RESOURCE_META = {
  documentation:{icon:'📖',color:'#5bbdff',label:'Docs'},
  video:{icon:'▶',color:'#ff5b5b',label:'Video'},
  book:{icon:'📚',color:'#ffdb5b',label:'Book'},
  practice:{icon:'⌨',color:'#5bff9b',label:'Practice'},
  course:{icon:'🎓',color:'#9b6dff',label:'Course'},
  article:{icon:'📄',color:'#ff9b5b',label:'Article'},
}
const DIFF_COLOR = { beginner:'#5bff9b', intermediate:'#ffdb5b', advanced:'#ff5b9b' }

// ── Topic badge with weak/strong indicators ───────────────────────────
function TopicBadge({ name, weakTopics, strongTopics }) {
  const isWeak   = weakTopics?.includes(name)
  const isStrong = strongTopics?.includes(name)
  if (!isWeak && !isStrong) return null
  return (
    <span style={{ fontSize:10, color: isWeak?'#ff5b5b':'#5bff9b', background: isWeak?'rgba(255,91,91,0.12)':'rgba(91,255,155,0.1)', border:`1px solid ${isWeak?'rgba(255,91,91,0.3)':'rgba(91,255,155,0.25)'}`, borderRadius:20, padding:'2px 8px', marginLeft:6 }}>
      {isWeak ? '⚠ Weak' : '✓ Strong'}
    </span>
  )
}

// ── Topics tab ────────────────────────────────────────────────────────
function TopicsTab({ topics, weakTopics, strongTopics }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {(topics||[]).map((t,i) => (
        <div key={i} style={{ background:'#0f0f13', border:`1px solid ${weakTopics?.includes(t.name)?'rgba(255,91,91,0.3)':strongTopics?.includes(t.name)?'rgba(91,255,155,0.25)':'#1e1e2a'}`, borderRadius:10, padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#ddd', marginBottom:4, display:'flex', alignItems:'center' }}>
              {t.name}
              <TopicBadge name={t.name} weakTopics={weakTopics} strongTopics={strongTopics} />
            </div>
            {t.description && <div style={{ fontSize:12, color:'#666' }}>{t.description}</div>}
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0, marginLeft:12 }}>
            <span style={{ fontSize:11, color:PRIORITY_COLOR[t.priority]??'#888', background:`${PRIORITY_COLOR[t.priority]??'#888'}18`, borderRadius:4, padding:'2px 8px', fontWeight:600 }}>{t.priority}</span>
            <span style={{ fontSize:11, color:'#555' }}>~{t.estimated_hours}h</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Daily tasks ───────────────────────────────────────────────────────
function DailyTasksTab({ daily_tasks, weekIndex, progress, onToggle }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
      {DAYS.map(day => {
        const tasks = daily_tasks?.[day] || []
        if (!tasks.length) return null
        return (
          <div key={day} style={{ background:'#0f0f13', border:'1px solid #1e1e2a', borderRadius:10, padding:'14px' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#9b6dff', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>{day}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {tasks.map((task,ti) => {
                const key = `w${weekIndex}_${day}_${ti}`; const done = progress?.[key] ?? false
                return (
                  <label key={ti} style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer' }}>
                    <input type="checkbox" checked={done} onChange={() => onToggle(key,!done)} style={{ marginTop:2, accentColor:'#9b6dff', flexShrink:0 }} />
                    <span style={{ fontSize:12, color:done?'#555':'#ccc', textDecoration:done?'line-through':'none', lineHeight:1.5 }}>{task}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Resources ─────────────────────────────────────────────────────────
function ResourcesTab({ resources, resources_curated }) {
  const [expanded, setExpanded] = useState({})
  const hasCurated = resources_curated?.length > 0
  if (hasCurated) return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {resources_curated.map((group,gi) => {
        const isOpen = expanded[gi] !== false
        return (
          <div key={gi} style={{ background:'#0f0f13', border:'1px solid #1e1e2a', borderRadius:12, overflow:'hidden' }}>
            <button onClick={() => setExpanded(p => ({...p,[gi]:!isOpen}))}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:isOpen?'1px solid #1e1e2a':'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:6, height:6, borderRadius:'50%', background:'#9b6dff' }} />
                <span style={{ fontSize:13, fontWeight:600, color:'#c4a8ff' }}>{group.topic}</span>
                <span style={{ fontSize:11, color:'#555' }}>{group.items?.length} resources</span>
              </div>
              <span style={{ color:'#555', fontSize:12 }}>{isOpen?'▲':'▼'}</span>
            </button>
            {isOpen && (
              <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
                {(group.items||[]).map((r,ri) => {
                  const meta = RESOURCE_META[r.type] ?? RESOURCE_META.article; const url = r.url||r.link||'#'
                  return (
                    <a key={ri} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display:'flex', gap:12, padding:'12px 14px', background:'#14121a', border:'1px solid #1e1e2a', borderRadius:10, textDecoration:'none', transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='#2a2a38'; e.currentTarget.style.transform='translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor='#1e1e2a'; e.currentTarget.style.transform='none' }}>
                      <div style={{ width:40, height:40, borderRadius:8, background:`${meta.color}14`, border:`1px solid ${meta.color}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{meta.icon}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, color:'#ddd', marginBottom:4 }}>{r.title}</div>
                        <div style={{ fontSize:12, color:'#666', lineHeight:1.5, marginBottom:6 }}>{r.description}</div>
                        <div style={{ display:'flex', gap:6 }}>
                          <span style={{ fontSize:10, color:meta.color, background:`${meta.color}14`, borderRadius:4, padding:'2px 7px', fontWeight:600 }}>{meta.label}</span>
                          <span style={{ fontSize:10, color:DIFF_COLOR[r.difficulty]??'#888', background:`${DIFF_COLOR[r.difficulty]??'#888'}14`, borderRadius:4, padding:'2px 7px' }}>{r.difficulty}</span>
                        </div>
                      </div>
                      <span style={{ color:'#333', fontSize:16, alignSelf:'center', flexShrink:0 }}>→</span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
  if (!resources?.length) return <div style={{ textAlign:'center', padding:'32px 0', color:'#444', fontSize:13 }}>No resources for this week.</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {resources.map((r,i) => {
        const meta = RESOURCE_META[r.type] ?? RESOURCE_META.article
        return (
          <a key={i} href={r.url||r.link||'#'} target="_blank" rel="noopener noreferrer"
            style={{ display:'flex', gap:12, padding:'12px 14px', background:'#0f0f13', border:'1px solid #1e1e2a', borderRadius:10, textDecoration:'none' }}>
            <div style={{ width:36, height:36, borderRadius:8, background:`${meta.color}14`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>{meta.icon}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500, color:'#ddd', marginBottom:3 }}>{r.title}</div>
              {r.description && <div style={{ fontSize:12, color:'#666' }}>{r.description}</div>}
            </div>
            <span style={{ fontSize:10, color:meta.color, background:`${meta.color}14`, borderRadius:4, padding:'2px 7px', fontWeight:600, alignSelf:'center' }}>{meta.label}</span>
          </a>
        )
      })}
    </div>
  )
}

// ── Weekly test ───────────────────────────────────────────────────────
function TestTab({ test, weekIndex, weekNum, scores, onScore, planId, onTestSubmitted }) {
  const [answers, setAnswers]     = useState({})
  const [submitted, setSubmitted] = useState(false)
  const weekScore = scores?.[`week_${weekIndex}`]

  async function handleSubmit() {
    let correct = 0; const results = {}
    ;(test||[]).forEach((q,i) => {
      const isCorrect = answers[i] === q.correct_answer
      if (isCorrect) correct++
      results[i] = { chosen: answers[i], correct: isCorrect }
    })
    const pct = Math.round((correct/test.length)*100)
    const scoreObj = { correct, total:test.length, pct, results, answers, score:correct }
    setSubmitted(true)
    onScore(`week_${weekIndex}`, scoreObj)
    // Notify parent to save & potentially adapt
    onTestSubmitted?.({ week: weekNum, score: correct, total: test.length })
  }

  const showResult = submitted || !!weekScore
  return (
    <div>
      {showResult && (
        <div style={{ background:'#0d2918', border:'1px solid #1a4d2e', borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:13, color:'#5bff9b', fontWeight:600 }}>Score: {weekScore?.correct??0} / {test?.length??5}</div>
            <div style={{ fontSize:11, color:'#444', marginTop:2 }}>{weekScore?.pct??0}% · {weekScore?.pct>=70?'Great job!':weekScore?.pct>=50?'Keep going!':'More practice needed'}</div>
          </div>
          <button onClick={() => { setAnswers({}); setSubmitted(false) }} style={{ background:'none', border:'1px solid #2a2a38', borderRadius:6, padding:'5px 12px', color:'#888', fontSize:12, cursor:'pointer' }}>Retake</button>
        </div>
      )}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {(test||[]).map((q,i) => {
          const chosen = answers[i] ?? weekScore?.answers?.[i]
          return (
            <div key={i} style={{ background:'#0f0f13', border:'1px solid #1e1e2a', borderRadius:10, padding:'16px' }}>
              <div style={{ fontSize:13, fontWeight:500, color:'#ddd', marginBottom:12 }}><span style={{ color:'#9b6dff', marginRight:8 }}>Q{i+1}.</span>{q.question}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {(q.options||[]).map((opt,oi) => {
                  const isCorrect = opt===q.correct_answer; const isChosen = chosen===opt
                  let bg='#14121a', border='#1e1e2a', color='#aaa'
                  if (showResult) { if (isCorrect) { bg='#0d2918'; border='#1a4d2e'; color='#5bff9b' } else if (isChosen) { bg='#2a0d0d'; border='#4d1515'; color='#ff5b5b' } }
                  else if (isChosen) { bg='#1a1428'; border='#5c35aa'; color='#c4a8ff' }
                  return (
                    <button key={oi} disabled={showResult} onClick={() => !showResult && setAnswers(a => ({...a,[i]:opt}))}
                      style={{ display:'flex', alignItems:'center', gap:10, background:bg, border:`1px solid ${border}`, borderRadius:7, padding:'9px 12px', cursor:showResult?'default':'pointer', textAlign:'left', transition:'all 0.12s' }}>
                      <span style={{ width:22, height:22, borderRadius:'50%', background:isChosen||(showResult&&isCorrect)?border:'#1e1e2a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color, flexShrink:0 }}>{String.fromCharCode(65+oi)}</span>
                      <span style={{ fontSize:13, color }}>{opt}</span>
                      {showResult && isCorrect && <span style={{ marginLeft:'auto', color:'#5bff9b', fontSize:12 }}>✓</span>}
                      {showResult && isChosen && !isCorrect && <span style={{ marginLeft:'auto', color:'#ff5b5b', fontSize:12 }}>✗</span>}
                    </button>
                  )
                })}
              </div>
              {showResult && q.explanation && (
                <div style={{ marginTop:10, padding:'10px 12px', background:'#14121a', borderRadius:6, borderLeft:'2px solid #9b6dff', fontSize:12, color:'#888', lineHeight:1.6 }}>💡 {q.explanation}</div>
              )}
            </div>
          )
        })}
      </div>
      {!submitted && !weekScore && (
        <button onClick={handleSubmit} disabled={Object.keys(answers).length<(test?.length??5)}
          style={{ marginTop:20, background:'#5c35aa', border:'none', borderRadius:8, padding:'11px 24px', color:'#fff', fontSize:13, fontWeight:500, cursor:Object.keys(answers).length<(test?.length??5)?'not-allowed':'pointer', opacity:Object.keys(answers).length<(test?.length??5)?0.5:1 }}>
          Submit Test ({Object.keys(answers).length}/{test?.length??5} answered)
        </button>
      )}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────
function ProgressBar({ plan, progress }) {
  if (!plan) return null
  let total=0, done=0
  plan.weeks?.forEach((w,wi) => {
    Object.entries(w.daily_tasks||{}).forEach(([day,tasks]) => {
      tasks.forEach((_,ti) => { total++; if (progress[`w${wi}_${day}_${ti}`]) done++ })
    })
  })
  const pct = total>0 ? Math.round((done/total)*100) : 0
  return (
    <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:10, padding:'14px 18px', marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:12, color:'#888' }}>Overall Progress</span>
        <span style={{ fontSize:13, fontWeight:600, color:pct===100?'#5bff9b':'#9b6dff' }}>{pct}%</span>
      </div>
      <div style={{ height:6, background:'#1e1e2a', borderRadius:3 }}>
        <div style={{ width:`${pct}%`, height:'100%', background:pct===100?'#5bff9b':'#9b6dff', borderRadius:3, transition:'width 0.4s ease' }} />
      </div>
      <div style={{ fontSize:11, color:'#444', marginTop:6 }}>{done} of {total} tasks completed</div>
    </div>
  )
}

// ── Revision ──────────────────────────────────────────────────────────
function RevisionTab({ revision }) {
  if (!revision) return <div style={{ textAlign:'center', padding:'32px 0', color:'#444', fontSize:13 }}>No revision data generated for this week.</div>
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, color:'#5bff9b', fontSize:14, fontWeight:600 }}>
        <span style={{ fontSize:18 }}>⏱</span> One-Day Quick Revision
      </div>
      
      {revision.topics_to_revise?.length > 0 && (
        <div>
          <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>Topics to Revise</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {revision.topics_to_revise.map((t,i) => (
              <span key={i} style={{ background:'rgba(91,255,155,0.1)', border:'1px solid rgba(91,255,155,0.2)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'#5bff9b' }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {revision.key_points?.length > 0 && (
        <div>
          <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>Key Points</div>
          <ul style={{ margin:0, paddingLeft:20, color:'#ddd', fontSize:13, lineHeight:1.6, display:'flex', flexDirection:'column', gap:6 }}>
            {revision.key_points.map((kp,i) => (
              <li key={i} style={{ color:'#5bff9b' }}><span style={{ color:'#ddd' }}>{kp}</span></li>
            ))}
          </ul>
        </div>
      )}

      {revision.quick_tips?.length > 0 && (
        <div>
          <div style={{ fontSize:12, color:'#888', marginBottom:8 }}>Quick Tips</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {revision.quick_tips.map((qt,i) => (
              <div key={i} style={{ background:'linear-gradient(90deg, rgba(255,219,91,0.1) 0%, rgba(255,219,91,0.02) 100%)', border:'1px solid rgba(255,219,91,0.2)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#ddd', display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:14 }}>💡</span>
                <span style={{ paddingTop:1 }}>{qt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── PlanView (shared between generator and detail page) ───────────────
export function PlanView({ plan: initialPlan, planId: initialPlanId }) {
  const [plan,       setPlan]       = useState(initialPlan)
  const [planId,     setPlanId]     = useState(initialPlanId)
  const [activeWeek, setActiveWeek] = useState(0)
  const [activeTab,  setActiveTab]  = useState('topics')
  const [progress,   setProgress]   = useState(initialPlan?.progress?.completed_tasks || {})
  const [scores,     setScores]     = useState({})
  const [insights,   setInsights]   = useState(initialPlan?.insights || null)
  const [adapting,   setAdapting]   = useState(false)
  const [adaptMsg,   setAdaptMsg]   = useState(null)

  const weakTopics   = insights?.weak_topics   ?? plan?.progress?.weak_topics   ?? []
  const strongTopics = insights?.strong_topics ?? plan?.progress?.strong_topics ?? []

  const toggleTask  = useCallback((key,val) => setProgress(p => ({...p,[key]:val})), [])
  const saveScore   = useCallback((key,val) => setScores(s => ({...s,[key]:val})), [])

  // Save progress to Firebase when tasks change
  useEffect(() => {
    if (!planId) return
    const total = Object.keys(progress).length
    const done  = Object.values(progress).filter(Boolean).length
    const pct   = total>0 ? (done/total)*100 : 0
    const allScores = Object.entries(scores).map(([k,v]) => ({
      week: parseInt(k.replace('week_',''))+1, score: v.correct, total: v.total
    }))
    fetch(`${API_BASE}/generate-study-plan/${planId}/progress`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ plan_id:planId, completed_tasks:progress, test_scores:allScores, completion_pct:pct }),
    }).catch(()=>{})
  }, [progress, planId])

  // Handle test submission — save score + trigger adaptation
  async function handleTestSubmitted(scoreData) {
    if (!planId) return
    // Small delay then auto-adapt
    await new Promise(r => setTimeout(r, 1000))
    await handleAdapt()
  }

  async function handleAdapt() {
    if (!planId) return
    setAdapting(true); setAdaptMsg(null)
    try {
      const res = await fetch(`${API_BASE}/generate-study-plan/${planId}/adapt`, { method:'POST' })
      const data = await res.json()
      if (data.adapted) {
        setInsights(data.insights)
        setAdaptMsg(data.message)
        // Update the adapted week in local state
        if (data.adapted_week) {
          setPlan(p => ({
            ...p,
            weeks: p.weeks.map(w => w.week === data.adapted_week.week ? data.adapted_week : w)
          }))
        }
      } else {
        setAdaptMsg(data.message)
      }
    } catch (err) {
      setAdaptMsg('Adaptation failed. Try again.')
    } finally {
      setAdapting(false)
    }
  }

  const week = plan?.weeks?.[activeWeek]
  const tabs = ['topics','daily_tasks','resources','weekly_test','revision']
  const tabLabels = { topics:'Topics', daily_tasks:'Daily Tasks', resources:'Resources', weekly_test:'Weekly Test', revision:'Revision' }

  if (!plan) return <div style={{ textAlign:'center', padding:'40px', color:'#555' }}>No plan data.</div>

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'0.06em' }}>Study Plan</div>
          <div style={{ fontSize:18, color:'#e8e4f0', fontFamily:'"DM Serif Display",Georgia,serif', fontWeight:400, marginTop:2 }}>
            {plan.topic} · {plan.duration_weeks} Weeks
          </div>
        </div>
        {/* Manual adapt button */}
        <button onClick={handleAdapt} disabled={adapting}
          style={{ background:adapting?'#2a2a38':'rgba(92,53,170,0.15)', border:'1px solid #5c35aa', borderRadius:8, padding:'7px 16px', color:adapting?'#555':'#9b6dff', fontSize:12, cursor:adapting?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6, transition:'all 0.15s' }}>
          {adapting ? '↻ Adapting...' : '🧠 Adapt Plan'}
        </button>
      </div>



      {/* Adapt message toast */}
      {adaptMsg && !adapting && (
        <div style={{ background:'#0d1a0d', border:'1px solid #1a3d1a', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:13, color:'#5bff9b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>✓ {adaptMsg}</span>
          <button onClick={() => setAdaptMsg(null)} style={{ background:'none', border:'none', color:'#444', cursor:'pointer', fontSize:16 }}>×</button>
        </div>
      )}

      <ProgressBar plan={plan} progress={progress} />

      {/* Week selector */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20 }}>
        {plan.weeks?.map((w,i) => {
          const color = WEEK_COLORS[i % WEEK_COLORS.length]
          const ws    = scores[`week_${i}`]
          const isAdapted = w.adapted === true
          return (
            <button key={i} onClick={() => { setActiveWeek(i); setActiveTab('topics') }}
              style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${activeWeek===i?color:'#1e1e2a'}`, background:activeWeek===i?`${color}18`:'#14121a', color:activeWeek===i?color:'#666', fontSize:12, fontWeight:activeWeek===i?600:400, cursor:'pointer', transition:'all 0.15s', position:'relative' }}>
              Week {w.week}
              {isAdapted && <span style={{ position:'absolute', top:-6, right:-6, fontSize:9, background:'#9b6dff', color:'white', borderRadius:4, padding:'1px 5px' }}>AI</span>}
              {ws && <span style={{ position:'absolute', top:isAdapted?8:-5, right:-5, width:16, height:16, borderRadius:'50%', background:ws.pct>=70?'#5bff9b':'#ff9b5b', fontSize:9, color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* Week content */}
      {week && (
        <div style={{ background:'#14121a', border:`1px solid ${WEEK_COLORS[activeWeek%WEEK_COLORS.length]}22`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'18px 22px', borderBottom:'1px solid #1e1e2a', background:`linear-gradient(135deg,${WEEK_COLORS[activeWeek%WEEK_COLORS.length]}10,transparent)` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:`${WEEK_COLORS[activeWeek%WEEK_COLORS.length]}22`, border:`1.5px solid ${WEEK_COLORS[activeWeek%WEEK_COLORS.length]}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:WEEK_COLORS[activeWeek%WEEK_COLORS.length] }}>{week.week}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:500, color:'#e8e4f0', display:'flex', alignItems:'center', gap:8 }}>
                  {week.title}
                  {week.adapted && <span style={{ fontSize:11, color:'#9b6dff', background:'rgba(155,109,255,0.12)', border:'1px solid rgba(155,109,255,0.3)', borderRadius:4, padding:'2px 8px' }}>✦ AI Adapted</span>}
                </div>
                {week.subtitle && <div style={{ fontSize:12, color:'#666', marginTop:1 }}>{week.subtitle}</div>}
                {week.adaptation_note && <div style={{ fontSize:11, color:'#9b6dff', marginTop:4, fontStyle:'italic' }}>🧠 {week.adaptation_note}</div>}
              </div>
              {week.resources_curated?.length>0 && (
                <div style={{ fontSize:11, color:'#9b6dff', background:'#1a1428', border:'1px solid #2a1f40', borderRadius:6, padding:'3px 10px', flexShrink:0 }}>
                  {week.resources_curated.reduce((a,g)=>a+(g.items?.length||0),0)} resources
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid #1e1e2a' }}>
            {tabs.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ flex:1, padding:'12px 8px', background:'none', border:'none', borderBottom:`2px solid ${activeTab===tab?WEEK_COLORS[activeWeek%WEEK_COLORS.length]:'transparent'}`, color:activeTab===tab?WEEK_COLORS[activeWeek%WEEK_COLORS.length]:'#555', fontSize:12, fontWeight:activeTab===tab?600:400, cursor:'pointer', transition:'all 0.15s', textAlign:'center' }}>
                {tabLabels[tab]}
                {tab==='resources' && week.resources_curated?.length>0 && <span style={{ marginLeft:4, fontSize:10, color:'#9b6dff' }}>★</span>}
                {tab==='weekly_test' && scores[`week_${activeWeek}`] && <span style={{ marginLeft:4, fontSize:10, color:'#5bff9b' }}>✓</span>}
              </button>
            ))}
          </div>

          <div style={{ padding:'20px 22px' }}>
            {activeTab==='topics'      && <TopicsTab topics={week.topics} weakTopics={weakTopics} strongTopics={strongTopics} />}
            {activeTab==='daily_tasks' && <DailyTasksTab daily_tasks={week.daily_tasks} weekIndex={activeWeek} progress={progress} onToggle={toggleTask} />}
            {activeTab==='resources'   && <ResourcesTab resources={week.resources} resources_curated={week.resources_curated} />}
            {activeTab==='weekly_test' && (
              <TestTab test={week.test} weekIndex={activeWeek} weekNum={week.week}
                scores={scores} onScore={saveScore}
                planId={planId} onTestSubmitted={handleTestSubmitted} />
            )}
            {activeTab==='revision'    && <RevisionTab revision={week.revision} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main generator page ───────────────────────────────────────────────
export default function StudyPlanAI() {
  const showToast = useAppStore(s => s.showToast)
  const userId    = useAppStore(s => s.auth.user?.uid ?? null)
  const navigate  = useNavigate()

  const [topic,   setTopic]   = useState('')
  const [weeks,   setWeeks]   = useState(4)
  const [loading, setLoading] = useState(false)
  const [plan,    setPlan]    = useState(null)
  const [error,   setError]   = useState(null)

  async function generate() {
    if (!topic.trim()) { setError('Enter a topic first.'); return }
    setLoading(true); setError(null); setPlan(null)
    try {
      const res = await fetch(`${API_BASE}/generate-study-plan`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ topic:topic.trim(), duration_weeks:weeks, user_id:userId }),
      })
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.detail??`Error ${res.status}`) }
      const data = await res.json()
      setPlan(data)
      showToast?.(`${weeks}-week plan generated!`, 'success')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth:960, animation:'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes lbar{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontWeight:400, fontSize:28, color:'#e8e4f0', marginBottom:4 }}>Study Plan Generator</h1>
          <p style={{ color:'#555', fontSize:13 }}>AI-powered adaptive weekly plan — learns from your performance.</p>
        </div>
        {userId && (
          <button onClick={() => navigate('/studyplan/history')}
            style={{ background:'none', border:'1px solid #2a2a38', borderRadius:8, padding:'8px 16px', color:'#9b6dff', fontSize:12, cursor:'pointer' }}>
            📋 My Plans
          </button>
        )}
      </div>

      <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'20px 22px', marginBottom:24 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>What do you want to study?</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key==='Enter' && generate()}
              placeholder='"PyTorch", "DSA", "System Design", "React"'
              style={{ width:'100%', background:'#0f0f13', border:'1px solid #2a2a38', borderRadius:8, padding:'10px 14px', color:'#ccc', fontSize:14, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:6 }}>Duration</label>
            <select value={weeks} onChange={e => setWeeks(Number(e.target.value))}
              style={{ background:'#0f0f13', border:'1px solid #2a2a38', borderRadius:8, padding:'10px 14px', color:'#ccc', fontSize:14, outline:'none', cursor:'pointer' }}>
              {[1,2,3,4,6,8,10,12].map(w => <option key={w} value={w}>{w} week{w>1?'s':''}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={loading}
            style={{ background:loading?'#2a2a38':'#5c35aa', border:'none', borderRadius:8, padding:'10px 24px', color:loading?'#666':'#fff', fontSize:13, fontWeight:500, cursor:loading?'not-allowed':'pointer', height:42 }}>
            {loading?'Generating...':'✦ Generate Plan'}
          </button>
        </div>
        {error && <p style={{ color:'#ff5b5b', fontSize:12, marginTop:10 }}>{error}</p>}
      </div>

      {loading && (
        <div style={{ textAlign:'center', padding:'48px 0' }}>
          <div style={{ fontSize:14, color:'#9b6dff', marginBottom:8 }}>Generating <strong style={{ color:'#c4a8ff' }}>{weeks}-week {topic}</strong> plan...</div>
          <div style={{ fontSize:12, color:'#555', marginBottom:4 }}>Creating topics, tasks, curated resources, and quizzes</div>
          <div style={{ fontSize:11, color:'#444', marginBottom:20 }}>Usually takes 20–40 seconds</div>
          <div style={{ width:260, height:3, background:'#1e1e2a', borderRadius:2, margin:'0 auto', overflow:'hidden' }}>
            <div style={{ height:'100%', width:'35%', background:'linear-gradient(90deg,#9b6dff,#5bbdff)', borderRadius:2, animation:'lbar 1.8s ease-in-out infinite' }} />
          </div>
        </div>
      )}

      {plan && !loading && (
        <div style={{ animation:'fadeUp 0.2s ease-out' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button onClick={() => { setPlan(null); setTopic('') }}
              style={{ background:'none', border:'1px solid #2a2a38', borderRadius:7, padding:'6px 14px', color:'#666', fontSize:12, cursor:'pointer' }}>New Plan</button>
          </div>
          <PlanView plan={plan} planId={plan.plan_id} />
        </div>
      )}
    </div>
  )
}
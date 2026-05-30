import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function PlanCard({ plan, onClick }) {
  const [hovered, setHovered] = useState(false)
  const pct     = Math.round(plan.completion_pct ?? 0)
  const scores  = plan.test_scores ?? []
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a,s)=>a+(s.score??s.pct??0),0)/scores.length) : null
  const date    = plan.created_at ? new Date(plan.created_at._seconds ? plan.created_at._seconds*1000 : plan.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Recently'

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:'#14121a', border:`1px solid ${hovered?'#2a2a38':'#1e1e2a'}`, borderRadius:12, padding:'18px 20px', cursor:'pointer', transition:'all 0.18s', transform:hovered?'translateY(-2px)':'none', boxShadow:hovered?'0 8px 24px rgba(0,0,0,0.3)':'none' }}>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:600, color:'#e8e4f0', marginBottom:4 }}>{plan.topic}</div>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#555' }}>{plan.duration_weeks} weeks</span>
            <span style={{ fontSize:10, color:'#333' }}>·</span>
            <span style={{ fontSize:12, color:'#555' }}>{date}</span>
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {avgScore !== null && (
            <div style={{ background:'#1a1428', border:'1px solid #2a1f40', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#9b6dff' }}>{avgScore}%</div>
              <div style={{ fontSize:9, color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>avg score</div>
            </div>
          )}
          <div style={{ background:'#0d1a0d', border:'1px solid #1a3d1a', borderRadius:8, padding:'6px 10px', textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, color:'#5bff9b' }}>{pct}%</div>
            <div style={{ fontSize:9, color:'#555', textTransform:'uppercase', letterSpacing:'0.5px' }}>done</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:5, background:'#1e1e2a', borderRadius:3, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background: pct===100?'#5bff9b': pct>50?'#9b6dff':'#5bbdff', borderRadius:3, transition:'width 0.4s' }} />
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', marginTop:10 }}>
        <span style={{ fontSize:11, color:'#444' }}>{scores.length} tests taken</span>
        <span style={{ fontSize:11, color:hovered?'#9b6dff':'#444', transition:'color 0.15s' }}>View Plan →</span>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background:'#14121a', border:'1px solid #1e1e2a', borderRadius:12, padding:'18px 20px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ height:18, background:'#1a1a24', borderRadius:4, width:'60%', marginBottom:8, animation:'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ height:12, background:'#1a1a24', borderRadius:4, width:'40%', animation:'pulse 1.5s ease-in-out infinite' }} />
        </div>
        <div style={{ width:60, height:50, background:'#1a1a24', borderRadius:8, animation:'pulse 1.5s ease-in-out infinite' }} />
      </div>
      <div style={{ height:5, background:'#1a1a24', borderRadius:3, animation:'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}


const DEMO_PLANS = [
  { id: 'demo-1', topic: 'Mathematics – Calculus', duration_weeks: 4, completion_pct: 72, test_scores: [{score:85},{score:78}], created_at: Date.now() - 7*24*60*60*1000 },
  { id: 'demo-2', topic: 'Physics – Mechanics', duration_weeks: 6, completion_pct: 45, test_scores: [{score:70}], created_at: Date.now() - 14*24*60*60*1000 },
  { id: 'demo-3', topic: 'Computer Science – Data Structures', duration_weeks: 3, completion_pct: 100, test_scores: [{score:92},{score:88},{score:95}], created_at: Date.now() - 30*24*60*60*1000 },
]

export default function StudyPlanHistory() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const isDemo    = new URLSearchParams(location.search).get('demo') === 'true'
  const userId    = useAppStore(s => s.auth.user?.uid ?? null)
  const effectiveId = userId ?? (isDemo ? 'demo' : null)
  const [plans,   setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!effectiveId) { setLoading(false); return }
    if (isDemo) { setPlans(DEMO_PLANS); setLoading(false); return }
    fetch(`${API_BASE}/generate-study-plan?user_id=${userId}`)
      .then(r => r.json())
      .then(d => setPlans(d.plans ?? []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [userId])

  return (
    <div style={{ maxWidth:960, animation:'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}} @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontWeight:400, fontSize:28, color:'#e8e4f0', marginBottom:4 }}>My Study Plans</h1>
          <p style={{ color:'#555', fontSize:13 }}>All your previously generated study plans.</p>
        </div>
        <button onClick={() => navigate('/studyplan')}
          style={{ background:'#5c35aa', border:'none', borderRadius:8, padding:'10px 20px', color:'#fff', fontSize:13, cursor:'pointer' }}>
          + New Plan
        </button>
      </div>

      {!effectiveId && (
        <div style={{ textAlign:'center', padding:'60px 0', color:'#555' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
          <div style={{ fontSize:14, marginBottom:8 }}>Sign in to view your study plans</div>
          <div style={{ fontSize:12, color:'#444' }}>Your plans are saved to your account</div>
        </div>
      )}

      {effectiveId && loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      {effectiveId && !loading && error && (
        <div style={{ background:'#1a1010', border:'1px solid #4d1515', borderRadius:10, padding:'16px', color:'#ff9b5b', fontSize:13 }}>
          ⚠ {error}
        </div>
      )}

      {effectiveId && !loading && !error && plans.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 0' }}>
          <div style={{ fontSize:40, marginBottom:16 }}>📚</div>
          <div style={{ fontSize:15, color:'#888', marginBottom:8 }}>No study plans yet</div>
          <div style={{ fontSize:13, color:'#555', marginBottom:24 }}>Generate your first AI-powered study plan</div>
          <button onClick={() => navigate('/studyplan')}
            style={{ background:'#5c35aa', border:'none', borderRadius:8, padding:'10px 24px', color:'#fff', fontSize:13, cursor:'pointer' }}>
            Create Study Plan
          </button>
        </div>
      )}

      {effectiveId && !loading && plans.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ fontSize:12, color:'#555', marginBottom:4 }}>{plans.length} plan{plans.length>1?'s':''}</div>
          {plans.map(plan => (
            <PlanCard key={plan.id} plan={plan} onClick={() => navigate(`/studyplan/${plan.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
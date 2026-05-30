import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PlanView } from '@/pages/StudyPlanAI'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function DetailSkeleton() {
  return (
    <div style={{ maxWidth:960 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
      {[80,200,40,300,300].map((h,i) => (
        <div key={i} style={{ height:h, background:'#14121a', borderRadius:10, marginBottom:16, animation:'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )
}

export default function StudyPlanDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const [plan,    setPlan]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    if (!id) return
    fetch(`${API_BASE}/generate-study-plan/${id}`)
      .then(r => { if (!r.ok) throw new Error('Plan not found'); return r.json() })
      .then(d => setPlan(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <DetailSkeleton />

  if (error) return (
    <div style={{ maxWidth:960 }}>
      <div style={{ background:'#1a1010', border:'1px solid #4d1515', borderRadius:10, padding:'20px', marginBottom:16, color:'#ff9b5b', fontSize:13 }}>
        ⚠ {error}
      </div>
      <button onClick={() => navigate('/studyplan/history')}
        style={{ background:'none', border:'1px solid #2a2a38', borderRadius:7, padding:'8px 16px', color:'#888', fontSize:12, cursor:'pointer' }}>
        ← Back to Plans
      </button>
    </div>
  )

  return (
    <div style={{ maxWidth:960, animation:'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ display:'flex', gap:12, marginBottom:24 }}>
        <button onClick={() => navigate('/studyplan/history')}
          style={{ background:'none', border:'1px solid #2a2a38', borderRadius:7, padding:'6px 14px', color:'#666', fontSize:12, cursor:'pointer' }}>
          ← My Plans
        </button>
        <button onClick={() => navigate('/progress')}
          style={{ background:'none', border:'1px solid #2a1f40', borderRadius:7, padding:'6px 14px', color:'#9b6dff', fontSize:12, cursor:'pointer' }}>
          📊 View Analytics
        </button>
      </div>
      <PlanView plan={plan} planId={id} />
    </div>
  )
}
import { useNavigate } from 'react-router-dom'
import useAppStore, {
  selectDocuments,
  selectRoadmap,
  selectCareer,
  selectMindmap,
} from '@/store/useAppStore'

const NAV = [
  { to: '/chat',      icon: '◎', label: 'Doubt Solver', desc: 'Ask any academic question',    color: '#9b6dff' },
  { to: '/documents', icon: '⊡', label: 'Doc Q&A',       desc: 'Upload & query documents',     color: '#5bbdff' },
  { to: '/mindmap',   icon: '◈', label: 'Mind Map',      desc: 'Visualise any concept',        color: '#ff9b5b' },
  { to: '/roadmap',   icon: '⟶', label: 'Roadmap',       desc: 'Map your learning path',       color: '#ff5b9b' },
  { to: '/career',    icon: '◆', label: 'Career AI',     desc: 'Discover your best-fit roles', color: '#ffdb5b' },
  { to: '/progress',  icon: '▲', label: 'Progress',      desc: 'Track your scores',            color: '#c4a8ff' },
]

const TIPS = [
  'Break complex topics into mind maps before studying — it boosts retention by up to 30%.',
  'Upload your lecture notes to Doc Q&A and quiz yourself before an exam.',
  'Generate a roadmap for any skill you want to learn — even non-academic ones.',
  'Log your test scores regularly to spot weak areas early.',
  'Use Career AI to discover roles that match your current skillset.',
]

export default function Dashboard() {
  const navigate    = useNavigate()
  const docs        = useAppStore(selectDocuments)
  const roadmap     = useAppStore(selectRoadmap)
  const career      = useAppStore(selectCareer)
  const mindmap     = useAppStore(selectMindmap)
  const displayName = useAppStore((s) => s.auth.user?.displayName ?? 'Student')

  const tip = TIPS[new Date().getDate() % TIPS.length]

  const stats = [
    { label: 'Docs Indexed',   value: docs.length,                   icon: '⊡', color: '#5bbdff', to: '/documents' },
    { label: 'Roadmap',        value: roadmap ? 'Active' : 'None',   icon: '⟶', color: '#ff5b9b', to: '/roadmap'   },
    { label: 'Career Matches', value: career?.roles?.length ?? 0,    icon: '◆', color: '#ffdb5b', to: '/career'    },
    { label: 'Mind Map',       value: mindmap ? mindmap.topic : '-', icon: '◈', color: '#ff9b5b', to: '/mindmap'   },
  ]

  const activity = [
    roadmap  && { icon: '⟶', color: '#ff5b9b', text: `Roadmap: ${roadmap.goal}`,          sub: roadmap.generatedAt  ? new Date(roadmap.generatedAt).toLocaleDateString()  : '' },
    career   && { icon: '◆', color: '#ffdb5b', text: `${career.roles?.length ?? 0} career roles matched`, sub: career.generatedAt   ? new Date(career.generatedAt).toLocaleDateString()   : '' },
    mindmap  && { icon: '◈', color: '#ff9b5b', text: `Mind map: ${mindmap.topic}`,         sub: mindmap.generatedAt  ? new Date(mindmap.generatedAt).toLocaleDateString()  : '' },
    ...docs.slice(0, 2).map(d => ({ icon: '⊡', color: '#5bbdff', text: `Uploaded: ${d.filename}`, sub: new Date(d.uploadedAt).toLocaleDateString() })),
  ].filter(Boolean).slice(0, 5)

  return (
    <div style={{ maxWidth: 1000, animation: 'fadeUp 0.25s ease-out' }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        .module-card:hover { border-color: #2a2a38 !important; transform: translateY(-2px); }
        .stat-card:hover   { border-color: #2a2a38 !important; }
      `}</style>

      {/* Greeting */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 32, color: '#e8e4f0', marginBottom: 6, letterSpacing: '-0.5px' }}>
          Good {greeting()}, {firstName(displayName)}
        </h1>
        <p style={{ color: '#555', fontSize: 14 }}>Your Academic OS is ready. What are you working on today?</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 32 }}>
        {stats.map((s) => (
          <button key={s.label} className="stat-card" onClick={() => navigate(s.to)}
            style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 10, padding: '16px 18px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s' }}>
            <div style={{ fontSize: 20, color: s.color, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#eee', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>{s.label}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, marginBottom: 32 }}>

        {/* Module grid */}
        <div>
          <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>All Modules</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {NAV.map((item, i) => (
              <button key={item.to} className="module-card" onClick={() => navigate(item.to)}
                style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '16px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s, transform 0.15s', animation: `fadeUp 0.2s ease-out ${i * 0.04}s both` }}>
                <div style={{ fontSize: 20, color: item.color, marginBottom: 10 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#ccc', marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>{item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tip */}
          <div style={{ background: '#14121a', border: '1px solid #3d2060', borderRadius: 12, padding: '16px 18px', borderLeft: '3px solid #9b6dff' }}>
            <p style={{ fontSize: 11, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Tip of the Day</p>
            <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, margin: 0 }}>{tip}</p>
          </div>

          {/* Recent activity */}
          <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '16px 18px', flex: 1 }}>
            <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>Recent Activity</p>
            {activity.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 13, color: '#444' }}>No activity yet.</p>
                <button onClick={() => navigate('/chat')}
                  style={{ marginTop: 10, background: '#5c35aa', border: 'none', borderRadius: 7, padding: '7px 14px', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                  Start with Doubt Solver →
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activity.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${a.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: a.color, flexShrink: 0 }}>
                      {a.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.4 }}>{a.text}</div>
                      {a.sub && <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>{a.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick start */}
          <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick Start</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Ask a doubt',       to: '/chat',      color: '#9b6dff' },
                { label: 'Upload a document', to: '/documents', color: '#5bbdff' },
                { label: 'Generate roadmap',  to: '/roadmap',   color: '#ff5b9b' },
              ].map((q) => (
                <button key={q.to} onClick={() => navigate(q.to)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#0f0f13', border: '1px solid #1e1e2a', borderRadius: 7, cursor: 'pointer', color: '#aaa', fontSize: 12, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = q.color + '44'; e.currentTarget.style.color = q.color }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e1e2a'; e.currentTarget.style.color = '#aaa' }}>
                  <span>{q.label}</span>
                  <span style={{ fontSize: 14 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

function firstName(name) {
  return (name ?? 'Student').split(' ')[0]
}
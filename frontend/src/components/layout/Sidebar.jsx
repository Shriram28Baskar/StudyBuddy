import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  // ── Core
  { to:'/dashboard',         icon:'⊞',  label:'Dashboard'       },
  { divider: true, label: 'AI Tutor' },
  { to:'/chat',              icon:'◎',  label:'Doubt Solver'     },
  { to:'/documents',         icon:'⊡',  label:'Doc Q&A'          },
  { to:'/voice-solver',      icon:'🎙', label:'Voice Solver'    },
  { to:'/photo-solver',      icon:'📷', label:'Photo Solver'    },
  // ── Study Planning
  { divider: true, label: 'Study Planning' },
  { to:'/studyplan',         icon:'◷',  label:'Study Plan',  exact:true },
  { to:'/studyplan/history', icon:'📋', label:'My Plans'         },
  { to:'/progress',          icon:'▲',  label:'Progress'         },
  // ── Exam Intelligence
  { divider: true, label: 'Exam Intel' },
  { to:'/pyqs',              icon:'📝', label:'PYQs Analyzer'   },
  { to:'/gap-analysis',      icon:'🔬', label:'Gap Analysis'    },
  { to:'/score-predictor',   icon:'🎯', label:'Score Predictor' },
  // ── Social
  { divider: true, label: 'Social' },
  { to:'/community',         icon:'🏰', label:'Community'        },
  { to:'/study-rooms',       icon:'🤝', label:'Study Rooms'      },
  { to:'/quiz-battle',       icon:'⚔',  label:'Quiz Battle'     },
  // ── Wellness
  { divider: true, label: 'Wellness' },
  { to:'/burnout',           icon:'🧘', label:'Burnout Check'   },
]

export default function Sidebar() {
  return (
    <aside style={{ width:220, minHeight:'100vh', background:'#0f0f13', borderRight:'1px solid #1e1e2a', display:'flex', flexDirection:'column', padding:'24px 0', position:'sticky', top:0, flexShrink:0, overflowY:'auto' }}>
      <div style={{ padding:'0 20px 24px', borderBottom:'1px solid #1e1e2a' }}>
        <div style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:20, color:'#e8e4f0', letterSpacing:'-0.5px' }}>
          Study<span style={{ color:'#9b6dff' }}>Buddy</span>
        </div>
        <div style={{ fontSize:11, color:'#555', marginTop:2, letterSpacing:'0.5px', textTransform:'uppercase' }}>Academic OS</div>
      </div>
      <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV_ITEMS.map((item, i) => {
          if (item.divider) {
            return (
              <div key={`divider-${i}`} style={{ padding:'12px 12px 4px', fontSize:10, color:'#444', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600, marginTop:4 }}>
                {item.label}
              </div>
            )
          }
          return (
            <NavLink key={item.to} to={item.to} end={item.exact}
              style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, textDecoration:'none',
                background: isActive?'#1a1428':'transparent',
                color:      isActive?'#c4a8ff':'#666',
                borderLeft: isActive?'2px solid #9b6dff':'2px solid transparent',
                fontSize:13, transition:'all 0.15s',
              })}>
              <span style={{ fontSize:15, width:20, textAlign:'center' }}>{item.icon}</span>
              {item.label}
            </NavLink>
          )
        })}
      </nav>
      <div style={{ padding:'12px 20px', borderTop:'1px solid #1e1e2a' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:'50%', background:'#2a1f40', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#9b6dff' }}>S</div>
          <div>
            <div style={{ fontSize:12, color:'#ccc' }}>Student</div>
            <div style={{ fontSize:11, color:'#555' }}>Pro Plan</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
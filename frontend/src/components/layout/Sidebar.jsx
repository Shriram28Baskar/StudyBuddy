import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to:'/dashboard',         icon:'⊞', label:'Dashboard'    },
  { to:'/chat',              icon:'◎', label:'Doubt Solver'  },
  { to:'/documents',         icon:'⊡', label:'Doc Q&A'       },
  { to:'/mindmap',           icon:'◈', label:'Mind Map'      },
  { to:'/studyplan',         icon:'◷', label:'Study Plan',   exact:true },
  { to:'/studyplan/history', icon:'📋', label:'My Plans'     },
  { to:'/roadmap',           icon:'⟶', label:'Roadmap'       },
  { to:'/career',            icon:'◆', label:'Career AI'     },
  { to:'/progress',          icon:'▲', label:'Progress'      },
]

export default function Sidebar() {
  return (
    <aside style={{ width:220, minHeight:'100vh', background:'#0f0f13', borderRight:'1px solid #1e1e2a', display:'flex', flexDirection:'column', padding:'24px 0', position:'sticky', top:0, flexShrink:0 }}>
      <div style={{ padding:'0 20px 24px', borderBottom:'1px solid #1e1e2a' }}>
        <div style={{ fontFamily:'"DM Serif Display",Georgia,serif', fontSize:20, color:'#e8e4f0', letterSpacing:'-0.5px' }}>
          Study<span style={{ color:'#9b6dff' }}>Buddy</span>
        </div>
        <div style={{ fontSize:11, color:'#555', marginTop:2, letterSpacing:'0.5px', textTransform:'uppercase' }}>Academic OS</div>
      </div>
      <nav style={{ flex:1, padding:'16px 12px', display:'flex', flexDirection:'column', gap:2 }}>
        {NAV_ITEMS.map(item => (
          <NavLink key={item.to} to={item.to} end={item.exact}
            style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, textDecoration:'none',
              background: isActive?'#1a1428':'transparent',
              color:      isActive?'#c4a8ff':'#666',
              borderLeft: isActive?'2px solid #9b6dff':'2px solid transparent',
              fontSize:13, transition:'all 0.15s',
            })}>
            <span style={{ fontSize:16, width:20, textAlign:'center' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
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
import { useLocation, useNavigate } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'
import { useEffect, useState } from 'react'

const PAGE_TITLES = {
  '/dashboard':         { title:'Dashboard',         sub:'Your academic overview' },
  '/chat':              { title:'Doubt Solver',       sub:'Ask anything, get instant help' },
  '/documents':         { title:'Doc Q&A',            sub:'Upload and query your documents' },
  '/mindmap':           { title:'Mind Map',           sub:'Visualise any concept' },
  '/studyplan':         { title:'Study Plan',         sub:'AI-generated weekly study plan with quizzes' },
  '/studyplan/history': { title:'My Study Plans',     sub:'All your previously generated plans' },
  '/roadmap':           { title:'Roadmap',            sub:'Build your learning path' },
  '/career':            { title:'Career AI',          sub:'Discover your best career fit' },
  '/progress':          { title:'Progress Dashboard', sub:'Analytics across all your study plans' },
}

// Context‑aware AI hints
const PAGE_HINTS = {
  '/studyplan': '🧠 Tip: Complete today’s checklist to stay on track',
  '/progress': '📊 Tip: Focus on weak topics to improve faster',
  '/chat': '⚡ Ask specific doubts for better answers',
  '/mindmap': '🧠 Generate a mind map to visualize concepts',
  '/roadmap': '🗺️ Tip: Start with foundations, then build projects',
  '/career': '💼 Tip: Align skills with market demand',
  '/documents': '📄 Upload PDFs to ask questions about your documents',
}

// Contextual action buttons (dispatch custom events)
const PAGE_ACTIONS = {
  '/studyplan': { label: '⚡ Adapt Plan', event: 'topbar-action:adapt-plan' },
  '/chat': { label: '💬 Ask Doubt', event: 'topbar-action:ask-doubt' },
  '/mindmap': { label: '🧠 Generate', event: 'topbar-action:generate-mindmap' },
  '/roadmap': { label: '✨ Generate Roadmap', event: 'topbar-action:generate-roadmap' },
  '/career': { label: '🔍 Analyze', event: 'topbar-action:analyze-career' },
}

export default function TopBar() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { auth } = useAppStore()
  const user = auth.user
  const isDemo = new URLSearchParams(search).get('demo') === 'true'
  const key = Object.keys(PAGE_TITLES).find(k => pathname === k || pathname.startsWith(k+'/')) ?? ''
  const page = PAGE_TITLES[key] || { title:'StudyBuddy', sub:'' }
  const hint = PAGE_HINTS[key]
  const action = PAGE_ACTIONS[key]

  // Handler for action button – dispatches custom event so page components can react
  const handleActionClick = () => {
    if (action) {
      window.dispatchEvent(new CustomEvent(action.event))
    }
  }

  // Page transition indicator state (optional, just a visual bar)
  const [transitioning, setTransitioning] = useState(false)
  useEffect(() => {
    setTransitioning(true)
    const timeout = setTimeout(() => setTransitioning(false), 300)
    return () => clearTimeout(timeout)
  }, [pathname])

  return (
    <header style={{
      height: 60,
      borderBottom: '1px solid #1e1e2a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 32px',
      background: 'linear-gradient(to right, #0a0a0e, #0f0f18)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Page transition indicator */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        height: 2,
        width: transitioning ? '100%' : '0%',
        background: 'linear-gradient(90deg, #9b6dff, #5bbdff)',
        transition: 'width 0.3s ease-out',
        zIndex: 10,
      }} />

      <div>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#e8e4f0' }}>
          {page.title}
          {user?.displayName && (
            <span style={{ fontSize: 11, color: '#777', marginLeft: 12 }}>
              👋 {user.displayName}
            </span>
          )}
        </div>
        {page.sub && <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>{page.sub}</div>}
        {hint && (
          <div style={{ fontSize: 10, color: '#9b6dff', marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {action && (
          <button
            onClick={handleActionClick}
            style={{
              background: '#5c35aa',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#6d4bc9'}
            onMouseLeave={e => e.currentTarget.style.background = '#5c35aa'}
          >
            {action.label}
          </button>
        )}

        {isDemo && (
          <div style={{
            background: 'linear-gradient(90deg, #ff9b5b, #ff5b5b)',
            boxShadow: '0 0 10px rgba(255,155,91,0.4)',
            color: '#000',
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 'bold',
          }}>
            🧪 Demo Mode
          </div>
        )}

        <div style={{
          fontSize: 11,
          color: '#444',
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 6,
          padding: '4px 10px',
        }}>
          🚀 AI v1.0
        </div>
      </div>
    </header>
  )
}
import { useLocation, useNavigate } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'
import { useEffect, useState } from 'react'
import useNotifications from '@/hooks/useNotifications'

const PAGE_TITLES = {
  '/dashboard':         { title:'Dashboard',         sub:'Your academic overview' },
  '/chat':              { title:'Doubt Solver',       sub:'Ask anything, get instant help' },
  '/documents':         { title:'Doc Q&A',            sub:'Upload and query your documents' },
  '/studyplan':         { title:'Study Plan',         sub:'AI-generated weekly study plan with quizzes' },
  '/studyplan/history': { title:'My Study Plans',     sub:'All your previously generated plans' },
  '/progress':          { title:'Progress Dashboard', sub:'Analytics across all your study plans' },
  '/pyqs':              { title:'PYQs Analyzer',      sub:'Analyze past exam papers' },
  '/gap-analysis':      { title:'Gap Analysis',       sub:'Find and close your knowledge gaps' },
  '/score-predictor':   { title:'Score Predictor',    sub:'Estimate your performance' },
  '/voice-solver':      { title:'Voice Solver',       sub:'Solve problems by speaking' },
  '/photo-solver':      { title:'Photo Solver',       sub:'Upload math or science problems for AI solutions' },
  '/burnout':           { title:'Burnout Check',      sub:'Monitor your mental wellbeing' },
  '/community':         { title:'Community',          sub:'Your clans, friends & social hub' },
  '/community/clan':    { title:'Clan Dashboard',     sub:'Manage your clan' },
  '/study-rooms':       { title:'Study Rooms',        sub:'Study together in real time' },
  '/quiz-battle':       { title:'Quiz Battle',        sub:'Compete with peers in live quizzes' },
}

// Context‑aware AI hints
const PAGE_HINTS = {
  '/studyplan': '🧠 Tip: Complete today’s checklist to stay on track',
  '/progress': '📊 Tip: Focus on weak topics to improve faster',
  '/chat': '⚡ Ask specific doubts for better answers',
  '/documents': '📄 Upload PDFs to ask questions about your documents',
  '/pyqs':      '📝 Tip: Analyze papers from the last 5 years for best coverage',
  '/photo-solver': '📷 Tip: Ensure clear lighting and legible handwriting when capturing problems',
}

// Contextual action buttons (dispatch custom events)
const PAGE_ACTIONS = {
  '/studyplan': { label: '⚡ Adapt Plan',    event: 'topbar-action:adapt-plan'  },
  '/chat':      { label: '💬 Ask Doubt',    event: 'topbar-action:ask-doubt'   },
}

export default function TopBar() {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { auth } = useAppStore()
  const user = auth.user
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()
  const [showNotif, setShowNotif] = useState(false)
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

        {/* Notification Bell */}
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotif(!showNotif)}
              style={{
                background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                color: showNotif ? '#9b6dff' : '#888', display: 'flex', alignItems: 'center',
                justifyContent: 'center', width: 36, height: 36, borderRadius: 8,
                transition: 'all 0.15s', position: 'relative'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#14121a'}
              onMouseLeave={(e) => { if (!showNotif) e.currentTarget.style.background = 'none' }}
              title="Notifications"
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4, background: '#ff4d4d',
                  color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: '50%',
                  minWidth: 16, height: 16, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', padding: '0 2px', border: '2px solid #0f0f18'
                }}>
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotif && (
              <div style={{
                position: 'absolute', top: 44, right: 0, width: 320,
                background: 'rgba(20,18,26,0.95)', backdropFilter: 'blur(16px)',
                border: '1px solid #1e1e2a', borderRadius: 12, padding: '16px 0',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 1200,
                display: 'flex', flexDirection: 'column', gap: 10
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 8px 16px', borderBottom: '1px solid #1e1e2a' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#e8e4f0' }}>Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => {
                        markAllAsRead()
                        setShowNotif(false)
                      }}
                      style={{ background: 'none', border: 'none', color: '#9b6dff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#555', fontSize: 12 }}>
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          await markAsRead(n.id)
                          setShowNotif(false)
                          if (n.data?.clanId) {
                            navigate(`/community/clan/${n.data.clanId}`)
                          } else {
                            navigate('/community')
                          }
                        }}
                        style={{
                          padding: '10px 16px', borderBottom: '1px solid #14121a',
                          cursor: 'pointer', transition: 'background 0.15s',
                          background: n.read ? 'transparent' : 'rgba(155,109,255,0.04)',
                          display: 'flex', gap: 10, alignItems: 'flex-start'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(155,109,255,0.04)'}
                      >
                        <span style={{ fontSize: 14, marginTop: 2 }}>
                          {n.type?.startsWith('friend') ? '🤝' : '🏰'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: n.read ? 500 : 700, color: n.read ? '#aaa' : '#e8e4f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.title}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.3 }}>
                            {n.body}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
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
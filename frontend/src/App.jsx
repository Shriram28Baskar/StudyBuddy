import { useEffect, lazy, Suspense, useState, startTransition } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar       from '@/components/layout/Sidebar'
import TopBar        from '@/components/layout/TopBar'
import Spinner       from '@/components/ui/Spinner'
import ErrorBoundary from '@/components/ErrorBoundary'
import useAppStore   from '@/store/useAppStore'
import { onAuthChange } from '@/services/auth'

// ---------------------------------------------------------------------------
// Lazy page imports
// ---------------------------------------------------------------------------

const Login             = lazy(() => import('@/pages/Login'))
const Dashboard         = lazy(() => import('@/pages/Dashboard'))
const Chat              = lazy(() => import('@/pages/Chat'))
const Documents         = lazy(() => import('@/pages/Documents'))
const ProgressDashboard = lazy(() => import('@/pages/ProgressDashboard'))
const StudyPlanAI       = lazy(() => import('@/pages/StudyPlanAI'))
const StudyPlanHistory  = lazy(() => import('@/pages/StudyPlanHistory'))
const StudyPlanDetail   = lazy(() => import('@/pages/StudyPlanDetail'))
const PYQsAnalyzer      = lazy(() => import('@/pages/PYQsAnalyzer'))
const ScorePredictor    = lazy(() => import('@/pages/ScorePredictor'))
const BurnoutDetector   = lazy(() => import('@/pages/BurnoutDetector'))
const GapAnalysis       = lazy(() => import('@/pages/GapAnalysis'))
const VoiceSolver       = lazy(() => import('@/pages/VoiceSolver'))
const PhotoSolver       = lazy(() => import('@/pages/PhotoSolver'))
const StudyRooms        = lazy(() => import('@/pages/StudyRooms'))
const StudyRoom         = lazy(() => import('@/pages/StudyRoom'))
const QuizBattle        = lazy(() => import('@/pages/QuizBattle'))
const Community         = lazy(() => import('@/pages/Community'))
const ClanDashboard     = lazy(() => import('@/pages/ClanDashboard'))

// ---------------------------------------------------------------------------
// Splash loader
// ---------------------------------------------------------------------------

const SPLASH_MESSAGES = [
  '🧠 Initializing AI Engine...',
  '⚡ Loading your personalized system...',
  '🔍 Scanning knowledge base...',
  '✨ Preparing your dashboard...',
  '🚀 Almost there...',
]

function SplashLoader() {
  const [messageIndex, setMessageIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(
      () => setMessageIndex(prev => (prev + 1) % SPLASH_MESSAGES.length),
      1500,
    )
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0e', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
        Study<span style={{ color: '#7c3aed' }}>Buddy</span>
      </span>
      <Spinner size="lg" />
      <div style={{ fontSize: 13, color: '#9b6dff', marginTop: 8 }}>
        {SPLASH_MESSAGES[messageIndex]}
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Spinner size="lg" />
        <span style={{ fontSize: 13, color: '#555' }}>Loading...</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Route guards
// ---------------------------------------------------------------------------

function ProtectedRoute({ children }) {
  const { auth, authLoading } = useAppStore()
  const location = useLocation()
  const isDemo   = new URLSearchParams(location.search).get('demo') === 'true'

  if (authLoading)                       return <SplashLoader />
  if (!auth.isLoggedIn && !isDemo)       return <Navigate to="/login" replace />
  return children
}

// ---------------------------------------------------------------------------
// Global AI assistant button
// ---------------------------------------------------------------------------

function AIAssistantButton() {
  const navigate = useNavigate()
  const location = useLocation()
  const isDemo   = new URLSearchParams(location.search).get('demo') === 'true'
  const { auth } = useAppStore()

  if (!auth.isLoggedIn && !isDemo) return null

  return (
    <div
      onClick={() => startTransition(() => navigate('/chat'))}
      style={{ position: 'fixed', bottom: 20, right: 20, background: '#5c35aa', borderRadius: '50%', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.2s', zIndex: 1000 }}
      onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      <span style={{ fontSize: 24 }}>🧠</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Demo mode banner
// ---------------------------------------------------------------------------

function DemoBanner() {
  const location = useLocation()
  const isDemo   = new URLSearchParams(location.search).get('demo') === 'true'
  if (!isDemo) return null

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', background: '#ff9b5b', textAlign: 'center', padding: '4px', fontSize: '12px', fontWeight: 'bold', color: '#000', zIndex: 2000, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
      ⚡ Demo Mode Active — Explore all features without logging in
    </div>
  )
}

// ---------------------------------------------------------------------------
// App layout + routes
// ---------------------------------------------------------------------------

function AppLayout() {
  const location = useLocation()
  const isDemo   = new URLSearchParams(location.search).get('demo') === 'true'

  return (
    <>
      <DemoBanner />
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0e', paddingTop: isDemo ? 28 : 0 }}>
        <Sidebar />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <TopBar />
          <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
            <Suspense fallback={<PageLoader />}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <Routes>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard"          element={<Dashboard />} />
                    <Route path="chat"               element={<Chat />} />
                    <Route path="documents"          element={<Documents />} />
                    <Route path="pyqs"               element={<PYQsAnalyzer />} />
                    <Route path="gap-analysis"       element={<GapAnalysis />} />
                    <Route path="voice-solver"       element={<VoiceSolver />} />
                    <Route path="photo-solver"       element={<PhotoSolver />} />
                    <Route path="progress"           element={<ProgressDashboard />} />
                    <Route path="score-predictor"    element={<ScorePredictor />} />
                    <Route path="burnout"            element={<BurnoutDetector />} />
                    <Route path="study-rooms"        element={<StudyRooms />} />
                    <Route path="quiz-battle"        element={<QuizBattle />} />
                    <Route path="community"          element={<Community />} />
                    <Route path="community/clan/:clanId" element={<ClanDashboard />} />

                    <Route path="studyplan">
                      <Route index             element={<StudyPlanAI />} />
                      <Route path="history"    element={<StudyPlanHistory />} />
                      <Route path="view/:id"   element={<StudyPlanDetail />} />
                      <Route path=":id"        element={<LegacyPlanIdRedirect />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </main>
        </div>
      </div>
      <AIAssistantButton />
    </>
  )
}

function LegacyPlanIdRedirect() {
  const { id } = useParams()
  return <Navigate to={`/studyplan/view/${id}`} replace />
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function App() {
  const { setUser, clearAuth, setAuthLoading, authLoading } = useAppStore()

  useEffect(() => {
    const unsub = onAuthChange(firebaseUser => {
      if (firebaseUser) setUser(firebaseUser)
      else              clearAuth()
      setAuthLoading(false)
    })
    return unsub
  }, [setUser, clearAuth, setAuthLoading])

  useEffect(() => {
    if (!authLoading) {
      if (typeof window.__hideLoader === 'function') {
        window.__hideLoader()
      } else {
        const loader = document.getElementById('splash-loader')
        if (loader) loader.style.display = 'none'
      }
    }
  }, [authLoading])

  if (authLoading) return <SplashLoader />

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Suspense fallback={<SplashLoader />}><Login /></Suspense>} />

          {/* Study room – full-screen, outside normal sidebar layout */}
          <Route
            path="/study-rooms/:roomId"
            element={
              <ProtectedRoute>
                <Suspense fallback={<SplashLoader />}>
                  <StudyRoom />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Protected — demo mode bypasses auth check */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
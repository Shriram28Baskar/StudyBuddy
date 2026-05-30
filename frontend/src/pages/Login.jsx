import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '@/store/useAppStore'
import { loginWithEmail, registerWithEmail, loginWithGoogle, sendPasswordReset } from '@/services/auth'

// ── Loading messages ──────────────────────────────────────────────────
const LOADING_MSGS = [
  '🧠 Verifying credentials...',
  '🔐 Securing session...',
  '🚀 Preparing your dashboard...',
  '✨ Almost there...',
  '🔑 Unlocking features...',
]

// ── Feature list for hero panel ───────────────────────────────────────
const FEATURES = [
  { icon: '🧠', label: 'AI Doubt Solver',     desc: 'Instant answers to any question' },
  { icon: '🗺️', label: 'Smart Roadmaps',      desc: 'Personalised AI-generated learning paths' },
  { icon: '📊', label: 'Progress Analytics',  desc: 'Track every milestone & weak spot' },
  { icon: '📄', label: 'Doc Q&A',             desc: 'Chat with your study material' },
  { icon: '🎯', label: 'AI Study Plans',      desc: 'Weekly schedules with quizzes' },
]

// ── Password strength helper ──────────────────────────────────────────
function getStrength(pw) {
  if (!pw) return null
  if (pw.length >= 10) return { label: '✓ Strong',  color: '#5bff9b' }
  if (pw.length >= 6)  return { label: '⚡ Medium', color: '#ffdb5b' }
  return                      { label: '⚠ Weak',    color: '#ff5b5b' }
}

// ── Reusable input ────────────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, error, hint }) {
  const [focused, setFocused] = useState(false)
  const [visible, setVisible] = useState(false)
  const isPass = type === 'password'

  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: focused ? '#9b6dff' : '#666',
        marginBottom: 6, transition: 'color 0.2s',
      }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={isPass && visible ? 'text' : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: isPass ? '11px 38px 11px 13px' : '11px 13px',
            background: focused ? 'rgba(155,109,255,0.05)' : '#0f0f13',
            border: `1px solid ${error ? '#ff5b5b' : focused ? '#7c3aed' : '#2a2a38'}`,
            borderRadius: 9, color: '#ddd', fontSize: 13,
            outline: 'none', transition: 'all 0.2s', fontFamily: 'inherit',
            boxShadow: focused ? '0 0 0 3px rgba(124,58,237,0.10)' : 'none',
          }}
        />
        {isPass && (
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            style={{
              position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, opacity: 0.4, color: '#fff',
              transition: 'opacity 0.15s', padding: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
          >{visible ? '🙈' : '👁️'}</button>
        )}
      </div>
      {hint && <div style={{ fontSize: 10, color: hint.color, marginTop: 4 }}>{hint.label}</div>}
      {error && <div style={{ fontSize: 10, color: '#ff6b6b', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Animated background blobs ─────────────────────────────────────────
function Background() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 20% 20%, #120d20, #0a0a0e)' }} />
      <div style={{
        position: 'absolute', top: '-15%', left: '-8%', width: '50%', height: '50%',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
        animation: 'blobA 14s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-5%', width: '45%', height: '45%',
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,189,255,0.10) 0%, transparent 70%)',
        animation: 'blobB 18s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(155,109,255,0.03) 1px,transparent 1px),
                          linear-gradient(90deg,rgba(155,109,255,0.03) 1px,transparent 1px)`,
        backgroundSize: '44px 44px',
      }} />
      <style>{`
        @keyframes blobA {0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(3%,5%) scale(1.06);}}
        @keyframes blobB {0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-4%,-3%) scale(1.08);}}
        @keyframes fadeUp {from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
        @keyframes spin    {to{transform:rotate(360deg);}}
        @keyframes pulse   {0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.4);}50%{box-shadow:0 0 0 8px rgba(124,58,237,0);}}
      `}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate()
  const { setUser, auth, showToast } = useAppStore()

  // No redirect needed here — App.jsx's ProtectedRoute watches the store
  // and redirects automatically once auth.isLoggedIn becomes true

  // Form state
  const [mode, setMode]               = useState('signin')  // 'signin' | 'signup' | 'reset'
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [resetEmail, setResetEmail]   = useState('')

  // UI state
  const [error, setError]             = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [loading, setLoading]         = useState(false)
  const [loadingMsg, setLoadingMsg]   = useState('')
  const [resetSent, setResetSent]     = useState(false)
  const [mounted, setMounted]         = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Rotate loading messages
  useEffect(() => {
    if (!loading) return
    let i = 0
    setLoadingMsg(LOADING_MSGS[0])
    const t = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; setLoadingMsg(LOADING_MSGS[i]) }, 1500)
    return () => clearInterval(t)
  }, [loading])

  const clearErrors = () => { setError(''); setFieldErrors({}) }

  const switchMode = (m) => {
    setMode(m); clearErrors()
    setPassword(''); setConfirmPass(''); setDisplayName(''); setResetSent(false)
  }

  // ── Handlers ─────────────────────────────────────────────────────
  const handleEmailAuth = async (e) => {
    e.preventDefault(); clearErrors()

    // Validate
    const fe = {}
    if (mode === 'signup' && !displayName.trim()) fe.displayName = 'Name is required'
    if (!email.trim()) fe.email = 'Email is required'
    if (mode !== 'reset' && !password) fe.password = 'Password is required'
    if (mode === 'signup' && password !== confirmPass) fe.confirmPass = 'Passwords do not match'
    if (mode === 'signup' && password.length < 6) fe.password = 'At least 6 characters'
    if (Object.keys(fe).length) { setFieldErrors(fe); return }

    setLoading(true)
    try {
      if (mode === 'reset') {
        const result = await sendPasswordReset(resetEmail || email)
        if (result.error) throw new Error(result.error)
        setResetSent(true)
        setTimeout(() => switchMode('signin'), 4000)
      } else if (mode === 'signin') {
        const result = await loginWithEmail(email, password)
        if (result.error) throw new Error(result.error)
        setUser(result.data)   // → store updates → ProtectedRoute redirects
        showToast?.(`Welcome back, ${result.data.displayName || result.data.email}!`, 'success')
      } else {
        const result = await registerWithEmail(email, password, displayName)
        if (result.error) throw new Error(result.error)
        setUser(result.data)   // → store updates → ProtectedRoute redirects
        showToast?.('Account created! Welcome to StudyBuddy 🎉', 'success')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    clearErrors(); setLoading(true)
    try {
      const result = await loginWithGoogle()
      if (result.error) throw new Error(result.error)
      if (result.data) {
        setUser(result.data)   // → store updates → ProtectedRoute redirects
        showToast?.(`Welcome, ${result.data.displayName || result.data.email}!`, 'success')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const strength = mode === 'signup' ? getStrength(password) : null
  const anim = (delay) => mounted
    ? { animation: `fadeUp 0.5s ease ${delay}ms both` }
    : { opacity: 0 }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      fontFamily: "'DM Sans','Segoe UI',sans-serif",
      color: '#e8e4f0', position: 'relative',
    }}>
      <Background />

      {/* ── Left hero panel ──────────────────────────────────────── */}
      <div style={{
        flex: '0 0 400px', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '56px 48px',
        position: 'relative', zIndex: 1,
        borderRight: '1px solid rgba(255,255,255,0.04)',
        background: 'rgba(10,10,14,0.6)', backdropFilter: 'blur(12px)',
      }}>
        <div style={anim(0)}>
          {/* Brand */}
          <div style={{ marginBottom: 40 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 48, borderRadius: 14, fontSize: 22, marginBottom: 14,
              background: 'linear-gradient(135deg,#7c3aed,#5bbdff)',
              boxShadow: '0 6px 20px rgba(124,58,237,0.4)',
              animation: 'pulse 3s ease-in-out infinite',
            }}>🧠</div>
            <div style={{
              fontFamily: '"DM Serif Display",Georgia,serif',
              fontSize: 28, fontWeight: 400, color: '#fff', lineHeight: 1,
            }}>
              Study<span style={{ color: '#9b6dff' }}>Buddy</span>
            </div>
            <div style={{ fontSize: 11, color: '#3a3a52', marginTop: 4, letterSpacing: '0.1em' }}>
              YOUR AI STUDY COMPANION
            </div>
          </div>

          {/* Tagline */}
          <h2 style={{
            fontSize: 28, fontWeight: 800, lineHeight: 1.2,
            margin: '0 0 10px', letterSpacing: '-0.5px', color: '#f0eeff',
          }}>
            Study smarter,<br />
            <span style={{
              background: 'linear-gradient(90deg,#9b6dff,#5bbdff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>not harder.</span>
          </h2>
          <p style={{ fontSize: 13, color: '#4a4a62', lineHeight: 1.7, margin: '0 0 36px' }}>
            Adaptive AI that learns your weak spots and builds a study plan around your schedule.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FEATURES.map((f, i) => (
              <div
                key={f.label}
                style={{
                  ...anim(80 + i * 50),
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 10, padding: '11px 14px', transition: 'all 0.22s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(124,58,237,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)'
                  e.currentTarget.style.transform = 'translateX(4px)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.transform = 'translateX(0)'
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0, fontSize: 15,
                  background: 'rgba(124,58,237,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ccc' }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: '#444' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div style={{ ...anim(400), marginTop: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex' }}>
              {['🎓','📚','🎯','💡','⚡'].map((em, i) => (
                <div key={i} style={{
                  width: 24, height: 24, borderRadius: '50%',
                  background: `hsl(${260 + i * 15},55%,30%)`,
                  border: '2px solid #0a0a0e',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, marginLeft: i > 0 ? -6 : 0,
                }}>{em}</div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#555' }}>
              ⭐ 4.9 · Trusted by <strong style={{ color: '#666' }}>10,000+</strong> students
            </div>
          </div>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        padding: '48px 32px', position: 'relative', zIndex: 1,
      }}>
        <div style={{
          ...anim(60), width: '100%', maxWidth: 400,
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16, padding: '36px 32px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f0eeff' }}>
              {mode === 'signin' ? 'Welcome back 👋' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#555' }}>
              {mode === 'signin' ? 'Sign in to continue your learning journey' :
               mode === 'signup' ? 'Start your AI-powered study experience today' :
               "We'll send a reset link to your inbox"}
            </p>
          </div>

          {/* Reset sent state */}
          {mode === 'reset' && resetSent ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>📬</div>
              <div style={{
                background: '#0d2918', border: '1px solid #1a4d2e',
                borderRadius: 8, padding: '12px', color: '#5bff9b',
                fontSize: 13, marginBottom: 16,
              }}>
                ✅ Reset email sent! Check your inbox.
              </div>
              <p style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>
                Redirecting to sign in…
              </p>
              <button onClick={() => switchMode('signin')} style={s.linkBtn}>
                ← Back to sign in now
              </button>
            </div>
          ) : (
            <>
              {/* Google + Demo — hide on reset */}
              {mode !== 'reset' && (
                <>
                  <button
                    onClick={handleGoogle}
                    disabled={loading}
                    style={s.googleBtn}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#9b6dff'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = '#2a2a38'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </button>

                  <button
                    onClick={() => navigate('/dashboard?demo=true')}
                    style={s.demoBtn}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(92,53,170,0.25)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(92,53,170,0.15)'}
                  >
                    ⚡ Try Demo — no account needed
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#1e1e2a' }} />
                    <span style={{ fontSize: 11, color: '#3a3a4a' }}>or continue with email</span>
                    <div style={{ flex: 1, height: 1, background: '#1e1e2a' }} />
                  </div>
                </>
              )}

              {/* Email form */}
              <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {mode === 'signup' && (
                  <Field label="Full Name" value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Ada Lovelace" autoComplete="name"
                    error={fieldErrors.displayName} />
                )}

                <Field label="Email" type="email"
                  value={mode === 'reset' ? resetEmail : email}
                  onChange={e => mode === 'reset' ? setResetEmail(e.target.value) : setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email"
                  error={fieldErrors.email} />

                {mode !== 'reset' && (
                  <Field label="Password" type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    error={fieldErrors.password}
                    hint={strength} />
                )}

                {mode === 'signup' && (
                  <Field label="Confirm Password" type="password" value={confirmPass}
                    onChange={e => setConfirmPass(e.target.value)}
                    placeholder="••••••••" autoComplete="new-password"
                    error={fieldErrors.confirmPass} />
                )}

                {mode === 'signin' && (
                  <div style={{ textAlign: 'right', marginTop: -8 }}>
                    <button type="button" onClick={() => switchMode('reset')} style={s.forgotBtn}>
                      Forgot password?
                    </button>
                  </div>
                )}

                {error && (
                  <div style={{
                    background: '#2a0d0d', border: '1px solid #4d1515',
                    borderRadius: 8, padding: '10px 12px',
                    color: '#ff9b5b', fontSize: 12, display: 'flex', gap: 8,
                  }}>
                    ⚠️ {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...s.submitBtn,
                    background: loading ? 'rgba(92,53,170,0.5)' : '#5c35aa',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#6d45c4' }}
                  onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#5c35aa' }}
                >
                  {loading ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <span style={{
                        width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff', borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite', display: 'inline-block',
                      }} />
                      {loadingMsg}
                    </span>
                  ) : (
                    mode === 'signin' ? 'Sign In →'
                    : mode === 'signup' ? 'Create Account →'
                    : 'Send Reset Link'
                  )}
                </button>
              </form>

              {/* Mode switch */}
              <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#555' }}>
                {mode === 'signin' && (
                  <>Don't have an account?{' '}
                    <button onClick={() => switchMode('signup')} style={s.linkBtn}>Sign Up</button>
                  </>
                )}
                {mode === 'signup' && (
                  <>Already have an account?{' '}
                    <button onClick={() => switchMode('signin')} style={s.linkBtn}>Sign In</button>
                  </>
                )}
                {mode === 'reset' && (
                  <>Remember it?{' '}
                    <button onClick={() => switchMode('signin')} style={s.linkBtn}>Back to sign in</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <p style={{ ...anim(200), marginTop: 18, fontSize: 10, color: '#2e2e3e', textAlign: 'center' }}>
          By continuing you agree to our{' '}
          <span style={{ color: '#444', cursor: 'pointer' }}>Terms</span> &{' '}
          <span style={{ color: '#444', cursor: 'pointer' }}>Privacy Policy</span>
        </p>
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────
const s = {
  googleBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '10px 16px', background: '#0f0f13',
    border: '1px solid #2a2a38', borderRadius: 9,
    color: '#ccc', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit', marginBottom: 10,
  },
  demoBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '10px 16px', background: 'rgba(92,53,170,0.15)',
    border: '1px solid #5c35aa', borderRadius: 9,
    color: '#9b6dff', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'inherit',
  },
  submitBtn: {
    width: '100%', padding: '12px 16px', border: 'none', borderRadius: 9,
    color: '#fff', fontSize: 13, fontWeight: 600, letterSpacing: '0.02em',
    transition: 'all 0.2s', fontFamily: 'inherit',
    boxShadow: '0 4px 16px rgba(92,53,170,0.3)',
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#9b6dff',
    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
    fontWeight: 600, padding: 0, textDecoration: 'underline',
  },
  forgotBtn: {
    background: 'none', border: 'none', color: '#555',
    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0,
  },
}
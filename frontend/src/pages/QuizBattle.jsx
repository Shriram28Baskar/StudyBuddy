import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuizBattle } from '@/hooks/useQuizBattle'
import { quizBattleAPI } from '../services/api'

const SUBJECTS = [
  'General', 'Mathematics', 'Physics', 'Chemistry',
  'Biology', 'Computer Science', 'History',
]
const DIFFICULTIES = ['easy', 'medium', 'hard']

const DIFF_COLORS = { easy: '#22c55e', medium: '#f59e0b', hard: '#ef4444' }

// ─── Tiny reusable components ────────────────────────────────────────────────

function GlowCard({ children, style = {} }) {
  return (
    <div style={{
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 16,
      padding: 28,
      boxShadow: '0 4px 32px rgba(155,109,255,0.07)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function PrimaryBtn({ children, onClick, disabled, style = {}, color = '#9b6dff' }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: disabled ? '#2a2a3a' : hov ? '#7c57e0' : color,
        color: disabled ? '#555' : '#fff',
        border: 'none',
        borderRadius: 10,
        padding: '12px 24px',
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function Input({ value, onChange, placeholder, style = {}, maxLength }) {
  return (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        background: '#0f0d17',
        border: '1px solid #2a2a3a',
        borderRadius: 8,
        padding: '10px 14px',
        color: '#e8e4f0',
        fontSize: 14,
        outline: 'none',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
        ...style,
      }}
      onFocus={e => (e.target.style.borderColor = '#9b6dff')}
      onBlur={e => (e.target.style.borderColor = '#2a2a3a')}
    />
  )
}

// ─── LANDING VIEW ────────────────────────────────────────────────────────────

function LandingView({ onCreated, onJoined }) {
  const [name, setName]       = useState('')
  const [subject, setSubject] = useState('General')
  const [diff, setDiff]       = useState('medium')
  const [joinCode, setJoinCode] = useState('')
  const [joinName, setJoinName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [joinLoading, setJoinLoading] = useState(false)
  const [error, setError]       = useState('')
  const [joinError, setJoinError] = useState('')

  // Document-based question generation state
  const [docFile, setDocFile]           = useState(null)   // File object
  const [docQuestions, setDocQuestions] = useState(null)   // Generated questions array
  const [docLoading, setDocLoading]     = useState(false)  // Processing state
  const [docError, setDocError]         = useState('')
  const docInputRef = useRef(null)

  const handleDocUpload = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['pdf', 'docx', 'txt', 'md', 'png', 'jpg', 'jpeg', 'pptx']
    if (!allowed.includes(ext)) {
      setDocError(`Unsupported file type. Allowed: ${allowed.join(', ')}`)
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setDocError('File too large. Max: 20 MB.')
      return
    }
    setDocFile(file)
    setDocError('')
    setDocLoading(true)
    setDocQuestions(null)
    try {
      const { data } = await quizBattleAPI.generateFromDoc(file)
      setDocQuestions(data.questions)
    } catch (e) {
      setDocError(e.message || 'Failed to generate questions from document.')
      setDocFile(null)
    } finally {
      setDocLoading(false)
    }
  }

  const clearDoc = () => {
    setDocFile(null)
    setDocQuestions(null)
    setDocError('')
    if (docInputRef.current) docInputRef.current.value = ''
  }

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter your name'); return }
    setError('')
    setLoading(true)
    try {
      const { data } = await quizBattleAPI.create({ subject, difficulty: diff, playerName: name.trim(), docQuestions })
      onCreated(data.room_id, data.player_id, name.trim(), subject, diff)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) { setJoinError('Enter room code'); return }
    if (!joinName.trim()) { setJoinError('Enter your name'); return }
    setJoinError('')
    setJoinLoading(true)
    try {
      const { data } = await quizBattleAPI.join(joinCode.trim().toUpperCase(), joinName.trim())
      onJoined(data.room_id, data.player_id, joinName.trim())
    } catch (e) {
      setJoinError(e.message)
    } finally {
      setJoinLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>⚔️</div>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: '#e8e4f0', margin: 0, letterSpacing: '-1px' }}>
          Quiz <span style={{ color: '#9b6dff' }}>Battle</span>
        </h1>
        <p style={{ color: '#666', fontSize: 15, marginTop: 8 }}>
          Challenge a friend to a real-time 10-question battle. First to score highest wins!
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Create Room */}
        <GlowCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#9b6dff,#6d3fd6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏆</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e4f0' }}>Create Room</div>
              <div style={{ fontSize: 12, color: '#555' }}>Host a new quiz battle</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Your Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" maxLength={30} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Subject</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                style={{ background: '#0f0d17', border: '1px solid #2a2a3a', borderRadius: 8, padding: '10px 14px', color: '#e8e4f0', fontSize: 14, width: '100%', outline: 'none', cursor: 'pointer' }}
              >
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Difficulty</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    onClick={() => setDiff(d)}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 8,
                      border: diff === d ? `2px solid ${DIFF_COLORS[d]}` : '2px solid #2a2a3a',
                      background: diff === d ? `${DIFF_COLORS[d]}18` : 'transparent',
                      color: diff === d ? DIFF_COLORS[d] : '#555',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all 0.2s',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Document upload section */}
            <div style={{ borderTop: '1px solid #1e1e2a', paddingTop: 16 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 8, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                📄 Upload Document <span style={{ color: '#555', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
              </label>
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.pptx"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) handleDocUpload(e.target.files[0]) }}
                id="quiz-doc-upload"
              />
              {!docFile ? (
                <button
                  onClick={() => docInputRef.current?.click()}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#0f0d17',
                    border: '2px dashed #2a2a3a',
                    borderRadius: 10,
                    color: '#555',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#9b6dff'; e.currentTarget.style.color = '#9b6dff' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3a'; e.currentTarget.style.color = '#555' }}
                >
                  📎 Upload PDF, DOCX, TXT, or Image
                </button>
              ) : (
                <div style={{
                  background: docQuestions ? '#0d1a0f' : '#14121a',
                  border: `1px solid ${docQuestions ? '#1a4d2a' : docLoading ? '#3d2060' : '#2a2a3a'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <span style={{ fontSize: 20 }}>{docLoading ? '⏳' : docQuestions ? '✅' : '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: docQuestions ? '#5bff9b' : '#aaa', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {docFile.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                      {docLoading ? 'Generating 10 questions from document…' : docQuestions ? `✓ ${docQuestions.length} questions generated — will use these` : 'Ready'}
                    </div>
                  </div>
                  {!docLoading && (
                    <button
                      onClick={clearDoc}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16, padding: '0 2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ff5b5b'}
                      onMouseLeave={e => e.currentTarget.style.color = '#555'}
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
              {docError && (
                <div style={{ color: '#ff9b5b', fontSize: 12, marginTop: 6 }}>⚠ {docError}</div>
              )}
              {docQuestions && (
                <div style={{ fontSize: 11, color: '#3a7d4a', marginTop: 6 }}>
                  🎯 Questions will be generated from your document instead of by topic.
                </div>
              )}
            </div>

            {error && <div style={{ color: '#ff6b6b', fontSize: 13, padding: '8px 12px', background: '#ff6b6b18', borderRadius: 8 }}>{error}</div>}

            <PrimaryBtn onClick={handleCreate} disabled={loading} style={{ width: '100%', padding: '13px 0' }}>
              {loading ? '⏳ Creating...' : '🎮 Create Room'}
            </PrimaryBtn>
          </div>
        </GlowCard>

        {/* Join Room */}
        <GlowCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎯</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e4f0' }}>Join Room</div>
              <div style={{ fontSize: 12, color: '#555' }}>Enter a room code to join</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Room Code</label>
              <Input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                placeholder="e.g. AB12CD"
                style={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: '0.3em', textAlign: 'center' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Your Name</label>
              <Input value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Enter your name" maxLength={30} />
            </div>

            {/* Decorative divider */}
            <div style={{ borderTop: '1px solid #1e1e2a', marginTop: 4 }} />

            <div style={{ background: '#0f0d17', borderRadius: 10, padding: '16px', border: '1px dashed #2a2a3a' }}>
              <div style={{ fontSize: 12, color: '#555', textAlign: 'center', lineHeight: 1.6 }}>
                📋 Ask your friend for their 6-character<br />room code to jump into the battle
              </div>
            </div>

            {joinError && <div style={{ color: '#ff6b6b', fontSize: 13, padding: '8px 12px', background: '#ff6b6b18', borderRadius: 8 }}>{joinError}</div>}

            <PrimaryBtn
              onClick={handleJoin}
              disabled={joinLoading}
              color='#3b82f6'
              style={{ width: '100%', padding: '13px 0' }}
            >
              {joinLoading ? '⏳ Joining...' : '🚀 Join Battle'}
            </PrimaryBtn>
          </div>
        </GlowCard>
      </div>

      {/* Footer info */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 32 }}>
        {[['⚡', '10 Questions'], ['⏱️', '20s Per Q'], ['🏅', 'Instant Results']].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#555', fontSize: 13 }}>
            <span>{icon}</span><span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── WAITING VIEW ────────────────────────────────────────────────────────────

function WaitingView({ roomId, playerId, playerName, gameState, sendReady }) {
  const [copied, setCopied] = useState(false)

  const players = Object.values(gameState.players)
  const me = players.find(p => p.id === playerId)
  const opponent = players.find(p => p.id !== playerId)

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const myReady   = me?.ready || gameState.status === 'waiting_start'
  const oppReady  = opponent?.ready || false
  const canReady  = !myReady && gameState.status !== 'waiting_start'

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎮</div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#e8e4f0', margin: 0 }}>Battle Lobby</h2>
        <p style={{ color: '#555', marginTop: 6, fontSize: 14 }}>Share the room code with your opponent</p>
      </div>

      {/* Room code */}
      <GlowCard style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#666', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 12 }}>Room Code</div>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 40,
          fontWeight: 800,
          color: '#9b6dff',
          letterSpacing: '0.3em',
          textShadow: '0 0 20px rgba(155,109,255,0.4)',
          marginBottom: 16,
        }}>
          {roomId}
        </div>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? '#22c55e20' : '#9b6dff20',
            border: `1px solid ${copied ? '#22c55e' : '#9b6dff'}`,
            borderRadius: 8,
            padding: '8px 20px',
            color: copied ? '#22c55e' : '#9b6dff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy Code'}
        </button>
      </GlowCard>

      {/* Players */}
      <GlowCard style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#666', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 16 }}>Players</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Me */}
          <div style={{
            flex: 1,
            background: '#0f0d17',
            borderRadius: 12,
            padding: 16,
            border: '2px solid #22c55e',
            textAlign: 'center',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#22c55e20', border: '2px solid #22c55e', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
              {(me?.name || playerName || '?')[0].toUpperCase()}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e4f0' }}>{me?.name || playerName}</div>
            <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>
              {myReady ? '✓ Ready' : 'You'}
            </div>
          </div>

          {/* VS */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#9b6dff', fontWeight: 800, fontSize: 16 }}>VS</div>

          {/* Opponent */}
          <div style={{
            flex: 1,
            background: '#0f0d17',
            borderRadius: 12,
            padding: 16,
            border: opponent ? '2px solid #3b82f6' : '2px dashed #2a2a3a',
            textAlign: 'center',
          }}>
            {opponent ? (
              <>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#3b82f620', border: '2px solid #3b82f6', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                  {opponent.name[0].toUpperCase()}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e4f0' }}>{opponent.name}</div>
                <div style={{ fontSize: 12, color: oppReady ? '#22c55e' : '#f59e0b', marginTop: 4 }}>
                  {oppReady ? '✓ Ready' : '⏳ Not ready'}
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#2a2a3a', border: '2px dashed #444', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>?</div>
                <div style={{ fontSize: 14, color: '#444' }}>Waiting...</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4, animation: 'pulse 1.5s infinite' }}>Share your code</div>
              </>
            )}
          </div>
        </div>
      </GlowCard>

      {/* Status messages */}
      {gameState.generatingQuestions && (
        <div style={{ textAlign: 'center', color: '#9b6dff', fontSize: 14, padding: 16, background: '#9b6dff15', borderRadius: 12, border: '1px solid #9b6dff30', marginBottom: 16 }}>
          🤖 Generating questions... Hold tight!
        </div>
      )}

      {gameState.error && (
        <div style={{ color: '#ff6b6b', fontSize: 13, padding: '10px 14px', background: '#ff6b6b18', borderRadius: 8, marginBottom: 16 }}>
          ⚠️ {gameState.error}
        </div>
      )}

      {/* Ready button */}
      {myReady ? (
        <div style={{ textAlign: 'center', padding: '14px 0', color: '#555', fontSize: 14 }}>
          ⏳ Waiting for opponent to be ready...
        </div>
      ) : (
        <PrimaryBtn
          onClick={sendReady}
          disabled={!opponent || canReady === false}
          color='#22c55e'
          style={{ width: '100%', padding: '14px 0', fontSize: 15 }}
        >
          {!opponent ? '⏳ Waiting for player 2...' : '✅ Ready!'}
        </PrimaryBtn>
      )}
    </div>
  )
}

// ─── TIMER RING ──────────────────────────────────────────────────────────────

function TimerRing({ timeRemaining, total = 20 }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(1, timeRemaining / total))
  const dashOffset = circumference * (1 - progress)

  const color = timeRemaining > 10 ? '#22c55e' : timeRemaining > 5 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={48} cy={48} r={radius} fill="none" stroke="#1e1e2a" strokeWidth={6} />
        <circle
          cx={48} cy={48} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 800, color,
        transition: 'color 0.3s',
      }}>
        {timeRemaining}
      </div>
    </div>
  )
}

// ─── SCORE BAR ───────────────────────────────────────────────────────────────

function ScoreBar({ players, playerId, scores }) {
  const playerList = Object.values(players)
  if (playerList.length < 2) return null

  const me  = playerList.find(p => p.id === playerId) || playerList[0]
  const opp = playerList.find(p => p.id !== playerId) || playerList[1]

  const myScore  = scores[me.id]  ?? me.score ?? 0
  const oppScore = scores[opp.id] ?? opp.score ?? 0
  const total    = myScore + oppScore || 1
  const myPct    = Math.round((myScore / total) * 100)

  return (
    <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: '12px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#22c55e20', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#22c55e', fontWeight: 700 }}>
            {me.name[0].toUpperCase()}
          </div>
          <span style={{ fontSize: 13, color: '#e8e4f0', fontWeight: 600 }}>{me.name}</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{myScore}</span>
          <span style={{ color: '#444', fontWeight: 700 }}>vs</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#3b82f6' }}>{oppScore}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#e8e4f0', fontWeight: 600 }}>{opp.name}</span>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#3b82f620', border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#3b82f6', fontWeight: 700 }}>
            {opp.name[0].toUpperCase()}
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 6, borderRadius: 3, background: '#3b82f6', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${myPct}%`,
          background: 'linear-gradient(90deg, #22c55e, #16a34a)',
          borderRadius: 3,
          transition: 'width 0.6s ease',
          minWidth: myScore > 0 ? '6px' : '0',
        }} />
      </div>
    </div>
  )
}

// ─── BATTLE VIEW ─────────────────────────────────────────────────────────────

function BattleView({ playerId, gameState, sendAnswer }) {
  const { questions, currentQuestion, myAnswer, scores, players, timeRemaining, subject } = gameState
  const q = questions[currentQuestion]
  const [lastCorrect, setLastCorrect] = useState(null)   // null | true | false

  // When myAnswer is set and we know the correct answer, flash colour
  useEffect(() => {
    if (myAnswer && q) {
      const correct = q.correct_answer?.toUpperCase()
      setLastCorrect(myAnswer === correct)
    } else {
      setLastCorrect(null)
    }
  }, [myAnswer, currentQuestion])

  if (!q) {
    return (
      <div style={{ textAlign: 'center', color: '#555', padding: 40 }}>
        ⏳ Loading question...
      </div>
    )
  }

  const optionLetters = ['A', 'B', 'C', 'D']

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Score bar */}
      <ScoreBar players={players} playerId={playerId} scores={scores} />

      {/* Question card */}
      <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 16, padding: 28 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TimerRing timeRemaining={timeRemaining} total={20} />
            <div>
              <div style={{ fontSize: 12, color: '#666', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Question</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e4f0' }}>
                {currentQuestion + 1} <span style={{ color: '#444', fontSize: 16 }}>/ {questions.length}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: '#9b6dff20',
              color: '#9b6dff',
              border: '1px solid #9b6dff40',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: 12,
              fontWeight: 600,
            }}>
              {subject || 'General'}
            </span>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i < currentQuestion ? '#22c55e' : i === currentQuestion ? '#9b6dff' : '#1e1e2a',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Question text */}
        <div style={{
          fontSize: 18,
          fontWeight: 600,
          color: '#e8e4f0',
          lineHeight: 1.6,
          marginBottom: 24,
          minHeight: 60,
        }}>
          {q.question}
        </div>

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {optionLetters.map(letter => {
            const optionText = q.options?.[letter]
            if (!optionText) return null

            const isSelected = myAnswer === letter
            const isAnswered = !!myAnswer
            const isCorrect  = q.correct_answer?.toUpperCase() === letter

            let borderColor = '#2a2a3a'
            let bgColor     = '#0f0d17'
            let textColor   = '#aaa'

            if (isSelected) {
              if (lastCorrect === true) {
                borderColor = '#22c55e'; bgColor = '#22c55e15'; textColor = '#22c55e'
              } else if (lastCorrect === false) {
                borderColor = '#ef4444'; bgColor = '#ef444415'; textColor = '#ef4444'
              } else {
                borderColor = '#9b6dff'; bgColor = '#9b6dff15'; textColor = '#9b6dff'
              }
            } else if (isAnswered && isCorrect) {
              borderColor = '#22c55e'; bgColor = '#22c55e10'; textColor = '#22c55e'
            }

            return (
              <button
                key={letter}
                onClick={() => !isAnswered && sendAnswer(currentQuestion, letter)}
                disabled={isAnswered}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 10,
                  cursor: isAnswered ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s',
                  transform: isSelected ? 'scale(1.01)' : 'scale(1)',
                }}
                onMouseEnter={e => { if (!isAnswered) e.currentTarget.style.borderColor = '#9b6dff' }}
                onMouseLeave={e => { if (!isAnswered) e.currentTarget.style.borderColor = '#2a2a3a' }}
              >
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: isSelected ? borderColor + '30' : '#1e1e2a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                  color: isSelected ? borderColor : '#555',
                  flexShrink: 0,
                }}>
                  {letter}
                </span>
                <span style={{ fontSize: 14, color: textColor, lineHeight: 1.4 }}>{optionText}</span>
              </button>
            )
          })}
        </div>

        {/* Waiting indicator */}
        {myAnswer && (
          <div style={{ textAlign: 'center', marginTop: 20, color: '#555', fontSize: 13 }}>
            ⏳ Waiting for opponent or next question...
          </div>
        )}
      </div>
    </div>
  )
}

// ─── RESULT VIEW ─────────────────────────────────────────────────────────────

function ResultView({ playerId, gameState, onPlayAgain }) {
  const { winner, finalScores, players } = gameState
  const [copied, setCopied] = useState(false)

  const playerList = Object.values(players)
  const me   = playerList.find(p => p.id === playerId)
  const opp  = playerList.find(p => p.id !== playerId)

  const isWinner = winner === playerId
  const isTie    = winner === 'tie'

  const emoji   = isTie ? '🎯' : isWinner ? '🏆' : '😔'
  const headline = isTie ? "It's a Tie!" : isWinner ? 'You Win!' : 'Better Luck Next Time!'
  const subline  = isTie
    ? 'Equally matched — impressive!'
    : isWinner
    ? 'Brilliant performance! 🎉'
    : 'Keep practising — you\'ll get them next time!'

  const myScore  = finalScores?.[playerId] ?? 0
  const oppScore = opp ? (finalScores?.[opp.id] ?? 0) : 0

  const handleCopyResult = () => {
    const text = `I just played Quiz Battle on StudyBuddy!\n${me?.name || 'Me'}: ${myScore} pts vs ${opp?.name || 'Opponent'}: ${oppScore} pts`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      {/* Emoji & headline */}
      <div style={{ fontSize: 72, marginBottom: 12, lineHeight: 1 }}>{emoji}</div>
      <h2 style={{ fontSize: 36, fontWeight: 900, color: '#e8e4f0', margin: '0 0 8px', letterSpacing: '-1px' }}>
        {headline}
      </h2>
      <p style={{ color: '#666', fontSize: 15, marginBottom: 32 }}>{subline}</p>

      {/* Score cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        <div style={{
          flex: 1,
          background: '#14121a',
          border: `2px solid ${isWinner || isTie ? '#22c55e' : '#2a2a3a'}`,
          borderRadius: 16,
          padding: 24,
          boxShadow: (isWinner || isTie) ? '0 0 20px rgba(34,197,94,0.15)' : 'none',
        }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#22c55e20', border: '2px solid #22c55e', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#22c55e' }}>
            {(me?.name || 'Me')[0].toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>{me?.name || 'You'}</div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#22c55e' }}>{myScore}</div>
          <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>points</div>
          {(isWinner && !isTie) && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 8, fontWeight: 600 }}>🏆 Winner</div>}
        </div>

        {opp && (
          <div style={{
            flex: 1,
            background: '#14121a',
            border: `2px solid ${(!isWinner && !isTie) ? '#3b82f6' : '#2a2a3a'}`,
            borderRadius: 16,
            padding: 24,
            boxShadow: (!isWinner && !isTie) ? '0 0 20px rgba(59,130,246,0.15)' : 'none',
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#3b82f620', border: '2px solid #3b82f6', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#3b82f6' }}>
              {opp.name[0].toUpperCase()}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>{opp.name}</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#3b82f6' }}>{oppScore}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>points</div>
            {(!isWinner && !isTie) && <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 8, fontWeight: 600 }}>🏆 Winner</div>}
          </div>
        )}
      </div>

      {/* Accuracy */}
      <GlowCard style={{ marginBottom: 24, textAlign: 'left' }}>
        <div style={{ fontSize: 12, color: '#666', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 12 }}>Summary</div>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#9b6dff' }}>{myScore / 10}</div>
            <div style={{ fontSize: 12, color: '#555' }}>Correct</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{10 - myScore / 10}</div>
            <div style={{ fontSize: 12, color: '#555' }}>Missed</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>{myScore}%</div>
            <div style={{ fontSize: 12, color: '#555' }}>Score</div>
          </div>
        </div>
      </GlowCard>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <PrimaryBtn onClick={onPlayAgain} style={{ flex: 1, padding: '13px 0' }}>
          🎮 Play Again
        </PrimaryBtn>
        <button
          onClick={handleCopyResult}
          style={{
            flex: 1,
            padding: '13px 0',
            background: copied ? '#22c55e20' : '#1e1e2a',
            border: `1px solid ${copied ? '#22c55e' : '#2a2a3a'}`,
            borderRadius: 10,
            color: copied ? '#22c55e' : '#aaa',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {copied ? '✓ Copied!' : '📤 Share Result'}
        </button>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function QuizBattle() {
  const [view,       setView]       = useState('landing')   // landing | waiting | battle | result
  const [roomId,     setRoomId]     = useState(null)
  const [playerId,   setPlayerId]   = useState(null)
  const [playerName, setPlayerName] = useState('')
  const [subject,    setSubject]    = useState('General')
  const [difficulty, setDifficulty] = useState('medium')

  const { gameState, sendAnswer, sendReady, isConnected } =
    useQuizBattle(view !== 'landing' ? roomId : null, view !== 'landing' ? playerId : null)

  // Auto-transition based on game state
  useEffect(() => {
    if (gameState.status === 'active' && view === 'waiting') {
      setView('battle')
    }
  }, [gameState.status, view])

  useEffect(() => {
    if (gameState.status === 'finished' && view === 'battle') {
      setView('result')
    }
  }, [gameState.status, view])

  const handleCreated = (rid, pid, name, sub, diff) => {
    setRoomId(rid)
    setPlayerId(pid)
    setPlayerName(name)
    setSubject(sub)
    setDifficulty(diff)
    setView('waiting')
  }

  const handleJoined = (rid, pid, name) => {
    setRoomId(rid)
    setPlayerId(pid)
    setPlayerName(name)
    setView('waiting')
  }

  const handlePlayAgain = () => {
    setRoomId(null)
    setPlayerId(null)
    setPlayerName('')
    setView('landing')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0e', padding: '32px 24px' }}>
      {/* Connection badge */}
      {view !== 'landing' && (
        <div style={{
          position: 'fixed',
          top: 16,
          right: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 20,
          padding: '5px 12px',
          fontSize: 12,
          color: isConnected ? '#22c55e' : '#ef4444',
          zIndex: 100,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      )}

      {view === 'landing' && (
        <LandingView onCreated={handleCreated} onJoined={handleJoined} />
      )}

      {view === 'waiting' && (
        <WaitingView
          roomId={roomId}
          playerId={playerId}
          playerName={playerName}
          gameState={gameState}
          sendReady={sendReady}
        />
      )}

      {view === 'battle' && (
        <BattleView
          playerId={playerId}
          gameState={gameState}
          sendAnswer={sendAnswer}
        />
      )}

      {view === 'result' && (
        <ResultView
          playerId={playerId}
          gameState={gameState}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { studyRoomsAPI } from '../services/api'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormInput({ label, value, onChange, placeholder, type = 'text', maxLength }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        style={{
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #2a2a3a',
          background: '#0a0a0e',
          color: '#e8e4f0',
          fontSize: 14,
          outline: 'none',
          width: '100%',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = '#9b6dff' }}
        onBlur={e =>  { e.target.style.borderColor = '#2a2a3a' }}
      />
    </label>
  )
}

function ErrorBanner({ message }) {
  if (!message) return null
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 8,
      background: '#2a0a0a',
      border: '1px solid #5a1a1a',
      color: '#ff8080',
      fontSize: 13,
    }}>
      ⚠️ {message}
    </div>
  )
}

function Card({ title, emoji, children }) {
  return (
    <div style={{
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 16,
      padding: '28px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      flex: 1,
      minWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>{emoji}</span>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#e8e4f0', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StudyRooms landing page
// ---------------------------------------------------------------------------

export default function StudyRooms() {
  const navigate = useNavigate()

  // Create form
  const [roomName,       setRoomName]       = useState('')
  const [subject,        setSubject]        = useState('')
  const [hostName,       setHostName]       = useState('')
  const [maxParticipants, setMaxParticipants] = useState(6)
  const [createLoading,  setCreateLoading]  = useState(false)
  const [createError,    setCreateError]    = useState('')

  // Join form
  const [joinCode,    setJoinCode]    = useState('')
  const [userName,    setUserName]    = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError,   setJoinError]   = useState('')

  // ── Create room ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreateError('')
    if (!roomName.trim()) return setCreateError('Please enter a room name.')
    if (!hostName.trim()) return setCreateError('Please enter your name.')

    setCreateLoading(true)
    try {
      const { data } = await studyRoomsAPI.create({ roomName, subject, hostName, maxParticipants })
      navigate(`/study-rooms/${data.room_id}?userId=${data.host_user_id}`)
    } catch (e) {
      setCreateError(e.message)
    } finally {
      setCreateLoading(false)
    }
  }

  // ── Join room ──────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    setJoinError('')
    if (!joinCode.trim()) return setJoinError('Please enter a room code.')
    if (!userName.trim()) return setJoinError('Please enter your name.')

    setJoinLoading(true)
    try {
      const { data } = await studyRoomsAPI.join(joinCode, userName)
      navigate(`/study-rooms/${data.room_id}?userId=${data.user_id}`)
    } catch (e) {
      setJoinError(e.message)
    } finally {
      setJoinLoading(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px' }}>
      {/* Hero */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>🤝</div>
        <h1 style={{
          fontSize: 32,
          fontWeight: 900,
          color: '#e8e4f0',
          margin: '0 0 10px',
          letterSpacing: '-0.5px',
        }}>
          Collaborative Study Rooms
        </h1>
        <p style={{ color: '#666', fontSize: 15, margin: 0 }}>
          Shared whiteboard · Pomodoro timer · Live chat · Voice chat · PDF presentation · Up to 6 friends
        </p>
      </div>

      {/* Two cards side by side */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Create ─────────────────────────────────────────────────────── */}
        <Card title="Create a Room" emoji="✨">
          <FormInput
            label="Room Name"
            value={roomName}
            onChange={setRoomName}
            placeholder="e.g. Physics Finals Prep"
            maxLength={60}
          />
          <FormInput
            label="Subject / Topic"
            value={subject}
            onChange={setSubject}
            placeholder="e.g. Quantum Mechanics"
            maxLength={60}
          />
          <FormInput
            label="Your Name"
            value={hostName}
            onChange={setHostName}
            placeholder="e.g. Saish"
            maxLength={30}
          />

          {/* Max participants slider */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Max Participants
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#e8e4f0' }}>{maxParticipants}</span>
            </div>
            <input
              type="range"
              min={2}
              max={6}
              value={maxParticipants}
              onChange={e => setMaxParticipants(Number(e.target.value))}
              style={{ accentColor: '#9b6dff', width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#555' }}>
              <span>2</span><span>6</span>
            </div>
          </label>

          <ErrorBanner message={createError} />

          <button
            onClick={handleCreate}
            disabled={createLoading}
            style={{
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: createLoading ? '#2a2a3a' : 'linear-gradient(135deg, #9b6dff, #7c3aed)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: createLoading ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {createLoading ? '⏳ Creating…' : '🚀 Create Room'}
          </button>
        </Card>

        {/* ── Join ───────────────────────────────────────────────────────── */}
        <Card title="Join a Room" emoji="🔗">
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <p style={{ color: '#666', fontSize: 14, margin: '0 0 20px' }}>
              Got a code from a friend? Enter it below to jump straight in.
            </p>
          </div>

          {/* 6-char code input */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Room Code
            </span>
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              style={{
                padding: '14px 20px',
                borderRadius: 10,
                border: '2px solid #2a2a3a',
                background: '#0a0a0e',
                color: '#e8e4f0',
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '8px',
                textAlign: 'center',
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = '#9b6dff' }}
              onBlur={e =>  { e.target.style.borderColor = '#2a2a3a' }}
            />
          </label>

          <FormInput
            label="Your Name"
            value={userName}
            onChange={setUserName}
            placeholder="e.g. Riya"
            maxLength={30}
          />

          <ErrorBanner message={joinError} />

          <button
            onClick={handleJoin}
            disabled={joinLoading}
            style={{
              padding: '12px',
              borderRadius: 10,
              border: 'none',
              background: joinLoading ? '#2a2a3a' : 'linear-gradient(135deg, #5bbdff, #2a7eff)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: joinLoading ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {joinLoading ? '⏳ Joining…' : '🔗 Join Room'}
          </button>

          <div style={{ textAlign: 'center', color: '#444', fontSize: 12 }}>
            Ask your friend to share their 6-character room code.
          </div>
        </Card>
      </div>

      {/* Feature grid */}
      <div style={{ marginTop: 48 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#e8e4f0', marginBottom: 20, textAlign: 'center' }}>
          What's inside
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {[
            { emoji: '🎨', title: 'Shared Whiteboard', desc: 'Draw, annotate, and collaborate in real time' },
            { emoji: '⏱️', title: 'Pomodoro Timer',    desc: 'Synced countdown across all participants'   },
            { emoji: '💬', title: 'Live Chat',          desc: 'Text chat with colour-coded participants'   },
            { emoji: '👥', title: 'Presence Tracking',  desc: 'See who\'s online, who just joined'         },
            { emoji: '🎙️', title: 'Voice Chat',        desc: 'P2P voice with mute controls & speaking indicators' },
            { emoji: '📄', title: 'PDF Presentation',   desc: 'Host uploads a PDF, everyone views in sync' },
          ].map(f => (
            <div key={f.title} style={{
              background: '#14121a',
              border: '1px solid #1e1e2a',
              borderRadius: 12,
              padding: '16px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>{f.emoji}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c4a8ff', marginBottom: 4 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: '#555' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

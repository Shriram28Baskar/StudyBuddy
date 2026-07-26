/**
 * ParticipantBar
 * Horizontal strip showing all room participants with coloured avatars,
 * names, online/offline indicator, voice/mute state, and speaking glow.
 *
 * @param {object}   props
 * @param {Array}    props.participants   - Array of { user_id, name, color, connected, is_muted, voice_enabled }
 * @param {string}   props.myUserId
 * @param {string}   props.roomName
 * @param {string}   props.subject
 * @param {string}   props.joinCode
 * @param {boolean}  props.isConnected    - WebSocket connection status
 * @param {boolean}  props.isHost         - Whether current user is the host
 * @param {object}   props.document       - Current document { filename } or null
 * @param {Function} props.onUploadPdf    - Called when host clicks upload button (passes File)
 * @param {object}   props.speakingUsers  - { userId: { isSpeaking, volume } }
 */
export default function ParticipantBar({
  participants = [],
  myUserId,
  roomName,
  subject,
  joinCode,
  isConnected,
  isHost = false,
  document: doc = null,
  onUploadPdf,
  speakingUsers = {},
}) {
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file && onUploadPdf) {
      onUploadPdf(file)
    }
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '10px 20px',
      background: '#14121a',
      borderBottom: '1px solid #1e1e2a',
      flexShrink: 0,
      flexWrap: 'wrap',
    }}>
      {/* Room identity */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🚀</span>
          <span style={{
            fontWeight: 800,
            fontSize: 15,
            color: '#e8e4f0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {roomName || 'Study Room'}
          </span>
          {subject && (
            <span style={{
              padding: '2px 8px',
              borderRadius: 4,
              background: '#1a1428',
              border: '1px solid #3a2a5a',
              color: '#9b6dff',
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              {subject}
            </span>
          )}
        </div>
        {joinCode && (
          <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
            Code: <span style={{ color: '#9b6dff', fontFamily: 'monospace', letterSpacing: '1px', fontWeight: 700 }}>{joinCode}</span>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 32, background: '#2a2a3a', flexShrink: 0 }} />

      {/* PDF upload button (host only) */}
      {isHost && (
        <label
          title={doc ? `Current: ${doc.filename}` : 'Upload a PDF to present'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid #2a2a5a',
            background: doc ? '#1a1428' : '#14121a',
            color: doc ? '#c4a8ff' : '#9b6dff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          📄 {doc ? doc.filename : 'Upload PDF'}
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
      )}

      {/* Document indicator (non-host, when doc is present) */}
      {!isHost && doc && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 10px',
          borderRadius: 6,
          background: '#1a1428',
          border: '1px solid #3a2a5a',
          color: '#c4a8ff',
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          📄 {doc.filename}
        </span>
      )}

      {/* Divider (only if we showed doc controls) */}
      {(isHost || doc) && (
        <div style={{ width: 1, height: 32, background: '#2a2a3a', flexShrink: 0 }} />
      )}

      {/* Participants */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {participants.length === 0 ? (
          <span style={{ fontSize: 12, color: '#555' }}>No participants yet…</span>
        ) : (
          participants.map(p => {
            const isMe = p.user_id === myUserId
            const speaking = speakingUsers[p.user_id]
            const isSpeaking = speaking?.isSpeaking ?? false
            const volume = speaking?.volume ?? 0
            const voiceOn = p.voice_enabled ?? false
            const muted = p.is_muted ?? true

            // Speaking glow intensity scales with volume
            const glowOpacity = isSpeaking ? Math.min(1, volume / 80) : 0
            const glowColor = `rgba(91, 255, 155, ${glowOpacity})`

            return (
              <div
                key={p.user_id}
                title={`${p.name}${isMe ? ' (you)' : ''}${!p.connected ? ' – offline' : ''}${voiceOn ? (muted ? ' – muted' : ' – unmuted') : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px 3px 4px',
                  borderRadius: 20,
                  background: isMe ? '#1a1428' : 'transparent',
                  border: isMe ? '1px solid #3a2a5a' : '1px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {/* Avatar circle */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: p.color || '#9b6dff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 13,
                    color: '#000',
                    opacity: p.connected ? 1 : 0.4,
                    border: isMe ? '2px solid #9b6dff' : '2px solid transparent',
                    boxShadow: isSpeaking
                      ? `0 0 0 3px ${glowColor}, 0 0 12px ${glowColor}`
                      : 'none',
                    transition: 'box-shadow 0.3s ease',
                  }}>
                    {(p.name || '?')[0].toUpperCase()}
                  </div>
                  {/* Online dot */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: p.connected ? '#5bff9b' : '#555',
                    border: '2px solid #14121a',
                    boxShadow: p.connected ? '0 0 4px #5bff9b' : 'none',
                    transition: 'all 0.3s',
                  }} />

                  {/* Voice/mute icon overlay */}
                  {voiceOn && (
                    <div style={{
                      position: 'absolute',
                      top: -3,
                      right: -5,
                      fontSize: 10,
                      lineHeight: 1,
                      background: muted ? '#2a0a0a' : '#0a2a0a',
                      borderRadius: 4,
                      padding: '1px 2px',
                      border: `1px solid ${muted ? '#5a1a1a' : '#1a5a1a'}`,
                    }}>
                      {muted ? '🔇' : '🔊'}
                    </div>
                  )}
                </div>

                {/* Name */}
                <span style={{
                  fontSize: 12,
                  fontWeight: isMe ? 700 : 500,
                  color: p.connected ? (isMe ? '#c4a8ff' : '#aaa') : '#444',
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {isMe ? `${p.name} ★` : p.name}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* WS status pill (right-aligned) */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isConnected ? '#5bff9b' : '#ff5b5b',
          boxShadow: isConnected ? '0 0 6px #5bff9b' : '0 0 6px #ff5b5b',
          transition: 'all 0.3s',
        }} />
        <span style={{ fontSize: 11, color: isConnected ? '#5bff9b' : '#ff5b5b', fontWeight: 600 }}>
          {isConnected ? 'Connected' : 'Reconnecting…'}
        </span>
      </div>
    </div>
  )
}

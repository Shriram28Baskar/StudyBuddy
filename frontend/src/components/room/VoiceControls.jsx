import { useCallback, useEffect } from 'react'

/**
 * VoiceControls – toolbar for voice chat (join/leave, mute/unmute, status)
 *
 * @param {string}   voiceStatus  - 'idle' | 'connecting' | 'connected' | 'error'
 * @param {boolean}  isMuted
 * @param {string}   micPermission - 'prompt' | 'granted' | 'denied'
 * @param {Function} onJoinVoice
 * @param {Function} onLeaveVoice
 * @param {Function} onToggleMute
 */
export default function VoiceControls({
  voiceStatus = 'idle',
  isMuted = true,
  micPermission = 'prompt',
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
}) {
  const isActive = voiceStatus === 'connected' || voiceStatus === 'connecting'
  const micDenied = micPermission === 'denied'

  // Keyboard shortcut: Ctrl+M / Cmd+M to toggle mute
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault()
      if (isActive && onToggleMute) onToggleMute()
    }
  }, [isActive, onToggleMute])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Status dot color
  const statusColor = {
    idle: '#555',
    connecting: '#ffdb5b',
    connected: '#5bff9b',
    error: '#ff5b5b',
  }[voiceStatus] || '#555'

  const statusText = {
    idle: 'Voice Off',
    connecting: 'Connecting…',
    connected: 'Voice On',
    error: 'Voice Error',
  }[voiceStatus] || 'Voice Off'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      {/* Status indicator */}
      <div
        title={statusText}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: statusColor,
          boxShadow: voiceStatus === 'connected' ? `0 0 6px ${statusColor}` : 'none',
          transition: 'all 0.3s',
          flexShrink: 0,
        }}
      />

      {/* Join / Leave Voice button */}
      {!isActive ? (
        <button
          onClick={onJoinVoice}
          disabled={micDenied}
          title={micDenied ? 'Microphone access denied' : 'Join voice chat'}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid #1a3a1a',
            background: micDenied ? '#1a1a24' : '#0a2a0a',
            color: micDenied ? '#555' : '#5bff9b',
            fontSize: 12,
            fontWeight: 700,
            cursor: micDenied ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          🎙️ Join Voice
        </button>
      ) : (
        <button
          onClick={onLeaveVoice}
          title="Leave voice chat"
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid #3a1a1a',
            background: '#2a0a0a',
            color: '#ff8080',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          📴 Leave Voice
        </button>
      )}

      {/* Mute / Unmute button (only when voice is active) */}
      {isActive && (
        <button
          onClick={onToggleMute}
          title={`${isMuted ? 'Unmute' : 'Mute'} (Ctrl+M)`}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: isMuted ? '1px solid #3a2a2a' : '1px solid #1a3a2a',
            background: isMuted ? '#2a1a1a' : '#0a2a1a',
            color: isMuted ? '#ff8080' : '#5bff9b',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            transition: 'all 0.15s',
          }}
        >
          {isMuted ? '🔇 Muted' : '🔊 Unmute'}
        </button>
      )}

      {/* Mic denied warning */}
      {micDenied && (
        <span style={{
          fontSize: 11,
          color: '#ff8080',
          fontWeight: 600,
        }}>
          ⚠️ Mic blocked
        </span>
      )}
    </div>
  )
}

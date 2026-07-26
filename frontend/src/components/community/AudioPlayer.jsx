import { useState, useRef, useEffect } from 'react'

export default function AudioPlayer({ src, duration }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const audioRef = useRef(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const handleEnd = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('ended', handleEnd)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('ended', handleEnd)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play().catch(() => {})
    }
    setIsPlaying(!isPlaying)
  }

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00'
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#1a1428', padding: '8px 14px', borderRadius: 10, minWidth: 220, border: '1px solid #3d2060' }}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={togglePlay}
        style={{
          background: 'linear-gradient(135deg, #9b6dff, #5bbdff)', border: 'none', borderRadius: '50%', width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 13,
          boxShadow: '0 2px 8px rgba(155, 109, 255, 0.3)', transition: 'transform 0.15s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ height: 5, background: '#2d253f', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #9b6dff, #5bbdff)', transition: 'width 0.1s linear' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginTop: 5, fontFamily: 'monospace' }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RADIUS       = 45
const STROKE_WIDTH = 6
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const SVG_SIZE = (RADIUS + STROKE_WIDTH) * 2

// ---------------------------------------------------------------------------
// Format seconds → MM:SS
// ---------------------------------------------------------------------------

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Derive ring colour based on remaining fraction
// ---------------------------------------------------------------------------

function ringColor(progress) {
  if (progress > 0.5)  return '#5bff9b'  // green  – plenty of time
  if (progress > 0.25) return '#ffdb5b'  // yellow – getting close
  return '#ff5b5b'                        // red    – almost done
}

// ---------------------------------------------------------------------------
// Small preset button
// ---------------------------------------------------------------------------

function PresetBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        border: '1px solid #2a2a3a',
        background: '#1e1e2a',
        color: '#9b6dff',
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

// ---------------------------------------------------------------------------
// TimerPanel
// ---------------------------------------------------------------------------

/**
 * @param {object}   props
 * @param {object}   props.timer           - { remaining, is_running, phase, mode, duration_seconds }
 * @param {Function} props.onTimerStart    - (durationMinutes: number) => void
 * @param {Function} props.onTimerPause    - () => void
 * @param {Function} props.onTimerReset    - () => void
 */
export default function TimerPanel({ timer, onTimerStart, onTimerPause, onTimerReset }) {
  const [customMinutes, setCustomMinutes] = useState(25)

  const totalSeconds = timer.phase === 'work'
    ? (timer.duration_seconds ?? 25 * 60)
    : 5 * 60

  const progress = totalSeconds > 0 ? timer.remaining / totalSeconds : 1
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress)
  const arcColor = ringColor(progress)

  const isWork  = timer.phase === 'work'
  const isBreak = timer.phase === 'break'

  return (
    <div style={{
      background: '#14121a',
      border: '1px solid #1e1e2a',
      borderRadius: 12,
      padding: '20px 16px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
    }}>
      {/* Phase label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{isWork ? '🎯' : '☕'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: isWork ? '#9b6dff' : '#5bbdff', letterSpacing: '0.5px' }}>
          {isWork ? 'Focus Time' : 'Break Time'}
        </span>
      </div>

      {/* SVG ring */}
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Track */}
        <circle
          cx={SVG_SIZE / 2}
          cy={SVG_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#1e1e2a"
          strokeWidth={STROKE_WIDTH}
        />
        {/* Progress arc */}
        <circle
          cx={SVG_SIZE / 2}
          cy={SVG_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={arcColor}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s linear, stroke 0.5s ease' }}
        />
        {/* Time text – counter-rotate so it reads upright */}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#e8e4f0"
          fontSize="18"
          fontWeight="700"
          fontFamily="monospace"
          style={{ transform: `rotate(90deg)`, transformOrigin: 'center', transformBox: 'fill-box' }}
        >
          {formatTime(timer.remaining)}
        </text>
      </svg>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!timer.is_running ? (
          <button
            onClick={() => onTimerStart(customMinutes)}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#9b6dff',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={onTimerPause}
            style={{
              padding: '7px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#ffdb5b',
              color: '#000',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={onTimerReset}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid #2a2a3a',
            background: '#1e1e2a',
            color: '#aaa',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ↺ Reset
        </button>
      </div>

      {/* Custom duration input */}
      {!timer.is_running && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: '100%' }}>
          <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duration (min)</div>
          <input
            type="number"
            min={1}
            max={120}
            value={customMinutes}
            onChange={e => setCustomMinutes(Math.max(1, Math.min(120, Number(e.target.value))))}
            style={{
              width: 70,
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid #2a2a3a',
              background: '#0a0a0e',
              color: '#e8e4f0',
              fontSize: 14,
              textAlign: 'center',
            }}
          />
          {/* Quick presets */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[15, 25, 45, 60].map(m => (
              <PresetBtn key={m} label={`${m}m`} onClick={() => setCustomMinutes(m)} />
            ))}
          </div>
        </div>
      )}

      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: timer.is_running ? '#5bff9b' : '#555',
          boxShadow: timer.is_running ? '0 0 6px #5bff9b' : 'none',
          transition: 'all 0.3s',
        }} />
        <span style={{ fontSize: 11, color: '#555' }}>
          {timer.is_running ? 'Running – synced with room' : 'Paused'}
        </span>
      </div>
    </div>
  )
}

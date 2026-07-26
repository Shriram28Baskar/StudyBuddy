import { useRef, useEffect, useState, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Redraw helper – replays all whiteboard events onto the canvas context
// ---------------------------------------------------------------------------

function redrawAll(ctx, canvas, events) {
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  for (const event of events) {
    if (event.type === 'draw' && Array.isArray(event.path) && event.path.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = event.color || '#ffffff'
      ctx.lineWidth   = event.width  || 3
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(event.path[0][0], event.path[0][1])
      for (let i = 1; i < event.path.length; i++) {
        ctx.lineTo(event.path[i][0], event.path[i][1])
      }
      ctx.stroke()

    } else if (event.type === 'erase' && Array.isArray(event.path) && event.path.length > 1) {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth   = event.width || 20
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(event.path[0][0], event.path[0][1])
      for (let i = 1; i < event.path.length; i++) {
        ctx.lineTo(event.path[i][0], event.path[i][1])
      }
      ctx.stroke()
      ctx.restore()

    } else if (event.type === 'text' && event.content) {
      ctx.font      = '16px sans-serif'
      ctx.fillStyle = event.color || '#ffffff'
      ctx.fillText(event.content, event.x, event.y)
    }
  }
}

// ---------------------------------------------------------------------------
// Tool button component
// ---------------------------------------------------------------------------

function ToolBtn({ active, onClick, title, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: active ? '1px solid #9b6dff' : '1px solid #2a2a3a',
        background: active ? '#1a1428' : '#1e1e2a',
        color: active ? '#c4a8ff' : '#aaa',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Whiteboard component
// ---------------------------------------------------------------------------

/**
 * @param {object}   props
 * @param {Array}    props.events      - Whiteboard event array from room state
 * @param {Function} props.onDraw      - Called with draw/erase/text/clear/undo event
 * @param {string}   props.userId
 * @param {string}   props.myColor
 * @param {object}   props.cursors     - { userId: {x, y, color, name} }
 * @param {Function} props.onCursorMove - Called with {x, y} normalised [0-1]
 * @param {boolean}  props.hasPdf       - Whether a PDF is being displayed behind the canvas
 */
export default function Whiteboard({ events, onDraw, userId, myColor, cursors = {}, onCursorMove, hasPdf = false }) {
  const canvasRef     = useRef(null)
  const containerRef  = useRef(null)
  const isDrawingRef  = useRef(false)
  const currentPath   = useRef([])
  const lastRedrawId  = useRef(null)

  const [tool, setTool]           = useState('pen')      // pen | eraser | text | pan
  const [color, setColor]         = useState(myColor || '#ffffff')
  const [lineWidth, setLineWidth] = useState(3)

  // Keep color in sync when myColor prop updates
  useEffect(() => {
    if (myColor) setColor(myColor)
  }, [myColor])

  // Reset tool to pen if PDF is removed and we were in pan mode
  useEffect(() => {
    if (!hasPdf && tool === 'pan') {
      setTool('pen')
    }
  }, [hasPdf, tool])

  // ── Resize observer: keep canvas dimensions matching its container ─────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const canvas = canvasRef.current
        if (!canvas) continue
        const { width, height } = entry.contentRect
        // Preserve pixel data during resize by drawing to a temp canvas
        const tmpCanvas = document.createElement('canvas')
        tmpCanvas.width  = canvas.width
        tmpCanvas.height = canvas.height
        tmpCanvas.getContext('2d').drawImage(canvas, 0, 0)
        canvas.width  = Math.floor(width)
        canvas.height = Math.floor(height)
        // Re-render from events
        const ctx = canvas.getContext('2d')
        redrawAll(ctx, canvas, events)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [events])

  // ── Redraw whenever events array changes ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // Use requestAnimationFrame to batch rapid updates
    if (lastRedrawId.current) cancelAnimationFrame(lastRedrawId.current)
    lastRedrawId.current = requestAnimationFrame(() => {
      redrawAll(ctx, canvas, events)
    })
  }, [events])

  // ── Pointer helpers ────────────────────────────────────────────────────────

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    return [
      Math.round(e.clientX - rect.left),
      Math.round(e.clientY - rect.top),
    ]
  }, [])

  const onPointerDown = useCallback((e) => {
    if (tool === 'text' || tool === 'pan') return // handled separately / ignored in pan mode
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const pos = getPos(e)
    currentPath.current = [pos]
  }, [tool, getPos])

  const onPointerMove = useCallback((e) => {
    if (tool === 'pan') return
    const canvas = canvasRef.current
    if (!canvas) return

    const pos = getPos(e)

    // Emit cursor position (normalised)
    if (onCursorMove) {
      onCursorMove({
        x: pos[0] / canvas.width,
        y: pos[1] / canvas.height,
      })
    }

    if (!isDrawingRef.current) return
    currentPath.current.push(pos)

    // Live preview
    const ctx = canvas.getContext('2d')
    const path = currentPath.current
    if (path.length < 2) return

    if (tool === 'eraser') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(0,0,0,1)'
      ctx.lineWidth   = lineWidth * 4
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(path[path.length - 2][0], path[path.length - 2][1])
      ctx.lineTo(path[path.length - 1][0], path[path.length - 1][1])
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.strokeStyle = color
      ctx.lineWidth   = lineWidth
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.moveTo(path[path.length - 2][0], path[path.length - 2][1])
      ctx.lineTo(path[path.length - 1][0], path[path.length - 1][1])
      ctx.stroke()
    }
  }, [tool, color, lineWidth, getPos, onCursorMove])

  const onPointerUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    const path = currentPath.current
    if (path.length < 2) {
      currentPath.current = []
      return
    }

    if (tool === 'pen') {
      onDraw({ type: 'draw', path, color, width: lineWidth, user_id: userId })
    } else if (tool === 'eraser') {
      onDraw({ type: 'erase', path, width: lineWidth * 4, user_id: userId })
    }

    currentPath.current = []
  }, [tool, color, lineWidth, userId, onDraw])

  // ── Text tool: click to place text ────────────────────────────────────────
  const onCanvasClick = useCallback((e) => {
    if (tool !== 'text') return
    const [x, y] = getPos(e)
    const content = prompt('Enter text:')
    if (content?.trim()) {
      onDraw({ type: 'text', x, y, content: content.trim(), color, user_id: userId })
    }
  }, [tool, color, userId, onDraw, getPos])

  // ── Rendered cursor overlay positions ────────────────────────────────────
  const getCursorPixels = useCallback((nx, ny) => {
    const canvas = canvasRef.current
    if (!canvas) return { left: 0, top: 0 }
    return {
      left: Math.round(nx * canvas.width),
      top:  Math.round(ny * canvas.height),
    }
  }, [])

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const handleUndo  = () => onDraw({ type: 'undo',  user_id: userId })
  const handleClear = () => { if (window.confirm('Clear the whiteboard for everyone?')) onDraw({ type: 'clear', user_id: userId }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, pointerEvents: 'none' }}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#14121a',
        borderBottom: '1px solid #1e1e2a',
        flexWrap: 'wrap',
        flexShrink: 0,
        pointerEvents: 'auto',
      }}>
        {hasPdf && (
          <ToolBtn active={tool === 'pan'} onClick={() => setTool('pan')} title="Scroll/Interact with PDF">🖐️ Pan/Scroll</ToolBtn>
        )}
        <ToolBtn active={tool === 'pen'}    onClick={() => setTool('pen')}    title="Pen">✏️ Pen</ToolBtn>
        <ToolBtn active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser">🧹 Eraser</ToolBtn>
        <ToolBtn active={tool === 'text'}   onClick={() => setTool('text')}   title="Text">T Text</ToolBtn>

        <div style={{ width: 1, height: 24, background: '#2a2a3a', margin: '0 4px' }} />

        {/* Colour picker */}
        <label title="Stroke colour" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: '#aaa' }}>🎨</span>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            style={{ width: 28, height: 28, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}
          />
        </label>

        {/* Line width */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#aaa' }}>Width</span>
          <input
            type="range"
            min={1}
            max={20}
            value={lineWidth}
            onChange={e => setLineWidth(Number(e.target.value))}
            style={{ width: 80, accentColor: '#9b6dff' }}
          />
          <span style={{ fontSize: 12, color: '#9b6dff', minWidth: 20 }}>{lineWidth}</span>
        </label>

        <div style={{ width: 1, height: 24, background: '#2a2a3a', margin: '0 4px' }} />

        <ToolBtn onClick={handleUndo}  title="Undo your last stroke">↩ Undo</ToolBtn>
        <ToolBtn onClick={handleClear} title="Clear board" style={{ color: '#ff5b5b' }}>🗑 Clear</ToolBtn>

        {/* PDF overlay indicator */}
        {hasPdf && (
          <>
            <div style={{ width: 1, height: 24, background: '#2a2a3a', margin: '0 4px' }} />
            <span style={{ fontSize: 11, color: '#9b6dff', fontWeight: 600 }}>
              {tool === 'pan' ? '🖐️ Scroll & Zoom Mode' : '✏️ Drawing on PDF'}
            </span>
          </>
        )}
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          background: hasPdf ? 'transparent' : '#0d0b12',
          cursor: tool === 'pan' ? 'default' : (tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair'),
          pointerEvents: tool === 'pan' ? 'none' : 'auto',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={onCanvasClick}
        />

        {/* Remote cursors overlay */}
        {Object.entries(cursors).map(([uid, cur]) => {
          if (uid === userId) return null
          const canvas = canvasRef.current
          if (!canvas) return null
          const px = Math.round(cur.x * canvas.width)
          const py = Math.round(cur.y * canvas.height)
          return (
            <div
              key={uid}
              style={{
                position: 'absolute',
                left: px,
                top:  py,
                pointerEvents: 'none',
                transform: 'translate(-50%, -50%)',
                zIndex: 10,
              }}
            >
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: cur.color || '#9b6dff',
                boxShadow: `0 0 0 2px #0d0b12`,
              }} />
              <div style={{
                marginTop: 4,
                background: cur.color || '#9b6dff',
                color: '#000',
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}>
                {cur.name}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

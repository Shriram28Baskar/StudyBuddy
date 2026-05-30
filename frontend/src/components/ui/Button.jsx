/**
 * Button
 *
 * Props:
 *   variant  — 'primary' | 'ghost' | 'danger' | 'outline' | 'subtle'
 *   size     — 'sm' | 'md' | 'lg'
 *   loading  — bool (shows spinner, disables interaction)
 *   disabled — bool
 *   iconLeft — ReactNode (icon before label)
 *   iconRight— ReactNode (icon after label)
 *   fullWidth— bool
 *   onClick  — handler
 *   type     — 'button' | 'submit' | 'reset'
 *   children — label content
 */

const VARIANTS = {
  primary: {
    base:  { background: '#5c35aa', color: '#fff',  border: '1px solid #5c35aa' },
    hover: { background: '#7c4dff',                 border: '1px solid #7c4dff' },
  },
  ghost: {
    base:  { background: 'transparent', color: '#888', border: '1px solid #2a2a38' },
    hover: { background: '#14121a',     color: '#ccc', border: '1px solid #3d2060' },
  },
  danger: {
    base:  { background: 'transparent', color: '#ff5b5b', border: '1px solid #3d1515' },
    hover: { background: '#200a0a',                       border: '1px solid #5c2020' },
  },
  outline: {
    base:  { background: 'transparent', color: '#c4a8ff', border: '1px solid #3d2060' },
    hover: { background: '#1a1428',                       border: '1px solid #5c35aa' },
  },
  subtle: {
    base:  { background: '#14121a', color: '#888', border: '1px solid #1e1e2a' },
    hover: { background: '#1e1e2a', color: '#ccc', border: '1px solid #2a2a38' },
  },
}

const SIZES = {
  sm: { fontSize: 12, padding: '6px 12px',  borderRadius: 6,  gap: 5,  iconSize: 13 },
  md: { fontSize: 13, padding: '8px 16px',  borderRadius: 8,  gap: 6,  iconSize: 15 },
  lg: { fontSize: 14, padding: '10px 20px', borderRadius: 9,  gap: 8,  iconSize: 16 },
}

export default function Button({
  variant   = 'primary',
  size      = 'md',
  loading   = false,
  disabled  = false,
  iconLeft,
  iconRight,
  fullWidth = false,
  onClick,
  type      = 'button',
  children,
  style: extraStyle = {},
}) {
  const v   = VARIANTS[variant] ?? VARIANTS.primary
  const s   = SIZES[size]       ?? SIZES.md
  const off = disabled || loading

  function handleMouseEnter(e) {
    if (off) return
    Object.assign(e.currentTarget.style, v.hover)
  }

  function handleMouseLeave(e) {
    if (off) return
    Object.assign(e.currentTarget.style, v.base)
  }

  function handleMouseDown(e) {
    if (off) return
    e.currentTarget.style.transform = 'scale(0.97)'
  }

  function handleMouseUp(e) {
    if (off) return
    e.currentTarget.style.transform = 'scale(1)'
  }

  return (
    <button
      type={type}
      disabled={off}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            s.gap,
        fontSize:       s.fontSize,
        fontWeight:     500,
        padding:        s.padding,
        borderRadius:   s.borderRadius,
        cursor:         off ? 'not-allowed' : 'pointer',
        opacity:        off ? 0.5 : 1,
        transition:     'background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s',
        width:          fullWidth ? '100%' : undefined,
        fontFamily:     '"DM Sans", system-ui, sans-serif',
        lineHeight:     1,
        userSelect:     'none',
        whiteSpace:     'nowrap',
        ...v.base,
        ...extraStyle,
      }}
    >
      {/* Left icon or spinner */}
      {loading ? (
        <ButtonSpinner size={s.iconSize} />
      ) : (
        iconLeft && (
          <span style={{ display: 'flex', alignItems: 'center', fontSize: s.iconSize }}>
            {iconLeft}
          </span>
        )
      )}

      {/* Label */}
      {children && <span>{children}</span>}

      {/* Right icon */}
      {!loading && iconRight && (
        <span style={{ display: 'flex', alignItems: 'center', fontSize: s.iconSize }}>
          {iconRight}
        </span>
      )}
    </button>
  )
}

// ── Inline spinner for loading state ──────────────────────────────────
function ButtonSpinner({ size = 14 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'btnSpin 0.75s linear infinite', flexShrink: 0 }}
    >
      <style>{`@keyframes btnSpin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M12 2 a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
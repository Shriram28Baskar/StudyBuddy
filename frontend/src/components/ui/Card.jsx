/**
 * Card
 *
 * A flexible container component used throughout the app.
 *
 * Props:
 *   variant   — 'default' | 'brand' | 'flat' | 'ghost'
 *   padding   — 'none' | 'sm' | 'md' | 'lg'
 *   hoverable — bool (brightens border on hover)
 *   clickable — bool (cursor pointer + scale on click)
 *   onClick   — handler
 *   header    — ReactNode (rendered above content with a bottom border)
 *   footer    — ReactNode (rendered below content with a top border)
 *   accent    — color string for left-border accent (e.g. '#9b6dff')
 *   children  — main content
 *   style     — extra inline styles on the outer wrapper
 *
 * Sub-components exported for composition:
 *   Card.Title   — section heading inside a card
 *   Card.Label   — muted uppercase label
 *   Card.Divider — horizontal rule
 *   Card.Row     — horizontal flex row with space-between
 *   Card.Stat    — metric display (value + label)
 */

const VARIANTS = {
  default: {
    background:   '#14121a',
    border:       '1px solid #1e1e2a',
    borderRadius: 12,
  },
  brand: {
    background:   '#14121a',
    border:       '1px solid #3d2060',
    borderRadius: 12,
  },
  flat: {
    background:   '#0f0f13',
    border:       '1px solid #1e1e2a',
    borderRadius: 10,
  },
  ghost: {
    background:   'transparent',
    border:       '1px solid #1e1e2a',
    borderRadius: 10,
  },
}

const PADDINGS = {
  none: '0',
  sm:   '12px 14px',
  md:   '16px 18px',
  lg:   '20px 24px',
}

export default function Card({
  variant   = 'default',
  padding   = 'md',
  hoverable = false,
  clickable = false,
  onClick,
  header,
  footer,
  accent,
  children,
  style: extraStyle = {},
}) {
  const v          = VARIANTS[variant] ?? VARIANTS.default
  const isInteract = hoverable || clickable || typeof onClick === 'function'

  function handleMouseEnter(e) {
    if (!isInteract) return
    e.currentTarget.style.borderColor = '#2a2a38'
    if (variant === 'brand') e.currentTarget.style.borderColor = '#5c35aa'
  }

  function handleMouseLeave(e) {
    if (!isInteract) return
    e.currentTarget.style.borderColor = variant === 'brand' ? '#3d2060' : '#1e1e2a'
  }

  function handleMouseDown(e) {
    if (!clickable) return
    e.currentTarget.style.transform = 'scale(0.99)'
  }

  function handleMouseUp(e) {
    if (!clickable) return
    e.currentTarget.style.transform = 'scale(1)'
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      style={{
        ...v,
        display:       'flex',
        flexDirection: 'column',
        overflow:      'hidden',
        cursor:        clickable || onClick ? 'pointer' : 'default',
        transition:    'border-color 0.15s, transform 0.1s',
        borderLeft:    accent ? `3px solid ${accent}` : v.border,
        ...extraStyle,
      }}
    >
      {/* Optional header */}
      {header && (
        <div style={{
          padding:      PADDINGS[padding],
          paddingBottom: padding === 'none' ? 0 : undefined,
          borderBottom: '1px solid #1e1e2a',
        }}>
          {header}
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: PADDINGS[padding], flex: 1 }}>
        {children}
      </div>

      {/* Optional footer */}
      {footer && (
        <div style={{
          padding:   PADDINGS[padding],
          paddingTop: padding === 'none' ? 0 : undefined,
          borderTop: '1px solid #1e1e2a',
        }}>
          {footer}
        </div>
      )}
    </div>
  )
}

// ── Card.Title ────────────────────────────────────────────────────────
Card.Title = function CardTitle({ children, style: extra = {} }) {
  return (
    <div style={{
      fontSize:   15,
      fontWeight: 500,
      color:      '#e8e4f0',
      lineHeight: 1.4,
      ...extra,
    }}>
      {children}
    </div>
  )
}

// ── Card.Label ────────────────────────────────────────────────────────
Card.Label = function CardLabel({ children, style: extra = {} }) {
  return (
    <div style={{
      fontSize:      11,
      fontWeight:    500,
      color:         '#555',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      ...extra,
    }}>
      {children}
    </div>
  )
}

// ── Card.Divider ──────────────────────────────────────────────────────
Card.Divider = function CardDivider({ style: extra = {} }) {
  return (
    <hr style={{
      border:    'none',
      borderTop: '1px solid #1e1e2a',
      margin:    '12px 0',
      ...extra,
    }} />
  )
}

// ── Card.Row ──────────────────────────────────────────────────────────
Card.Row = function CardRow({ children, align = 'center', style: extra = {} }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     align,
      justifyContent: 'space-between',
      gap:            8,
      ...extra,
    }}>
      {children}
    </div>
  )
}

// ── Card.Stat — metric display (number + label) ───────────────────────
Card.Stat = function CardStat({ value, label, accent = '#9b6dff', trend, style: extra = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, ...extra }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#eee', lineHeight: 1 }}>
          {value}
        </span>
        {trend !== undefined && (
          <span style={{
            fontSize: 12,
            color:    trend >= 0 ? '#5bff9b' : '#ff5b5b',
          }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <span style={{ fontSize: 11, color: '#555' }}>{label}</span>
      {/* Accent underline */}
      <div style={{ width: 24, height: 2, background: accent, borderRadius: 1, marginTop: 4 }} />
    </div>
  )
}
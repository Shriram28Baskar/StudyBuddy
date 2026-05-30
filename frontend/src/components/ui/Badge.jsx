/**
 * Badge
 *
 * Props:
 *   variant  — 'default' | 'brand' | 'blue' | 'green' | 'orange' | 'pink' | 'red' | 'yellow' | 'outline'
 *   size     — 'sm' | 'md' | 'lg'
 *   dot      — bool (shows a colored dot before the label)
 *   children — content
 *   onClick  — optional click handler (makes it interactive)
 *   className — extra class names
 */

const VARIANTS = {
  default: {
    background: '#1e1e2a',
    color:      '#888',
    border:     '1px solid #2a2a38',
  },
  brand: {
    background: '#1a1428',
    color:      '#c4a8ff',
    border:     '1px solid #3d2060',
  },
  blue: {
    background: '#0d1e2e',
    color:      '#5bbdff',
    border:     '1px solid #1a3a55',
  },
  green: {
    background: '#0d2918',
    color:      '#5bff9b',
    border:     '1px solid #1a4d2e',
  },
  orange: {
    background: '#2a1a0d',
    color:      '#ff9b5b',
    border:     '1px solid #4d2e14',
  },
  pink: {
    background: '#2a0d1a',
    color:      '#ff5b9b',
    border:     '1px solid #4d1430',
  },
  red: {
    background: '#2a0d0d',
    color:      '#ff5b5b',
    border:     '1px solid #4d1515',
  },
  yellow: {
    background: '#2a220d',
    color:      '#ffdb5b',
    border:     '1px solid #4d3d14',
  },
  outline: {
    background: 'transparent',
    color:      '#888',
    border:     '1px solid #2a2a38',
  },
}

const SIZES = {
  sm: { fontSize: 10, padding: '1px 6px',  borderRadius: 4, gap: 4 },
  md: { fontSize: 11, padding: '2px 8px',  borderRadius: 5, gap: 5 },
  lg: { fontSize: 12, padding: '4px 10px', borderRadius: 6, gap: 6 },
}

export default function Badge({
  variant  = 'default',
  size     = 'md',
  dot      = false,
  onClick,
  children,
  style: extraStyle = {},
}) {
  const v = VARIANTS[variant] ?? VARIANTS.default
  const s = SIZES[size]       ?? SIZES.md

  const isClickable = typeof onClick === 'function'

  return (
    <span
      onClick={onClick}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        gap:            s.gap,
        fontSize:       s.fontSize,
        fontWeight:     500,
        padding:        s.padding,
        borderRadius:   s.borderRadius,
        background:     v.background,
        color:          v.color,
        border:         v.border,
        lineHeight:     1.4,
        whiteSpace:     'nowrap',
        userSelect:     'none',
        cursor:         isClickable ? 'pointer' : 'default',
        transition:     'opacity 0.15s',
        letterSpacing:  '0.01em',
        fontFamily:     '"DM Sans", system-ui, sans-serif',
        ...extraStyle,
      }}
      onMouseEnter={e => { if (isClickable) e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => { if (isClickable) e.currentTarget.style.opacity = '1' }}
    >
      {dot && (
        <span style={{
          width:        5,
          height:       5,
          borderRadius: '50%',
          background:   v.color,
          flexShrink:   0,
          display:      'inline-block',
        }} />
      )}
      {children}
    </span>
  )
}
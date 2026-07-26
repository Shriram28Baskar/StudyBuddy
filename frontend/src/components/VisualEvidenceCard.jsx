import { useState } from 'react'

const TYPE_LABELS = {
  weighted_graph:        'Weighted Graph',
  flowchart:             'Flowchart',
  table:                 'Table',
  circuit_diagram:       'Circuit Diagram',
  architecture_diagram:  'Architecture Diagram',
  equation:              'Equation',
  geometry:              'Geometry',
  uml:                   'UML Diagram',
  er_diagram:            'ER Diagram',
  state_machine:         'State Machine',
  screenshot:            'Screenshot',
  other:                 'Figure',
}

const TYPE_COLORS = {
  weighted_graph:        { bg: '#1a2744', border: '#3b82f6', text: '#93c5fd' },
  flowchart:             { bg: '#1a2a1a', border: '#22c55e', text: '#86efac' },
  table:                 { bg: '#1f1a2e', border: '#a855f7', text: '#d8b4fe' },
  circuit_diagram:       { bg: '#2a1a1a', border: '#ef4444', text: '#fca5a5' },
  architecture_diagram:  { bg: '#1a2333', border: '#06b6d4', text: '#67e8f9' },
  equation:              { bg: '#2a2200', border: '#eab308', text: '#fde047' },
  geometry:              { bg: '#2a1a2a', border: '#ec4899', text: '#f9a8d4' },
  uml:                   { bg: '#1a2333', border: '#06b6d4', text: '#67e8f9' },
  er_diagram:            { bg: '#1a2333', border: '#f97316', text: '#fdba74' },
  state_machine:         { bg: '#1a2a1a', border: '#22c55e', text: '#86efac' },
  screenshot:            { bg: '#1e1e2a', border: '#6b7280', text: '#9ca3af' },
  other:                 { bg: '#1e1e2a', border: '#6b7280', text: '#9ca3af' },
}

export default function VisualEvidenceCard({ evidence }) {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)

  const label  = TYPE_LABELS[evidence.type] || 'Figure'
  const colors = TYPE_COLORS[evidence.type] || TYPE_COLORS.other
  const confidencePct = Math.round((evidence.confidence || 0) * 100)

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
  const imgSrc   = evidence.url?.startsWith('http')
    ? evidence.url
    : `${API_BASE}${evidence.url}`

  return (
    <div
      style={{
        background:   colors.bg,
        border:       `1px solid ${colors.border}`,
        borderRadius: 12,
        overflow:     'hidden',
        transition:   'transform 0.2s, box-shadow 0.2s',
        cursor:       'pointer',
        flex:         '0 0 auto',
        width:        expanded ? '100%' : 220,
      }}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={e => {
        e.currentTarget.style.transform   = 'translateY(-2px)'
        e.currentTarget.style.boxShadow   = `0 8px 24px rgba(0,0,0,0.4)`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform   = 'translateY(0)'
        e.currentTarget.style.boxShadow   = 'none'
      }}
    >
      {/* Image */}
      <div style={{
        width:      '100%',
        height:     expanded ? 340 : 140,
        background: '#0d0d14',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'height 0.3s',
        overflow:   'hidden',
      }}>
        {!imgError ? (
          <img
            src={imgSrc}
            alt={evidence.reason || label}
            onError={() => setImgError(true)}
            style={{
              maxWidth:   '100%',
              maxHeight:  '100%',
              objectFit:  'contain',
            }}
          />
        ) : (
          <div style={{ color: '#4b5563', fontSize: 13, textAlign: 'center', padding: 12 }}>
            📊 Image unavailable
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px' }}>
        {/* Type badge + page + confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            background:   colors.border + '22',
            color:        colors.text,
            border:       `1px solid ${colors.border}`,
            borderRadius: 6,
            fontSize:     10,
            padding:      '2px 7px',
            fontWeight:   600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            {label}
          </span>
          <span style={{
            background: '#1e293b',
            color:      '#94a3b8',
            borderRadius: 6,
            fontSize:   10,
            padding:    '2px 7px',
            fontWeight: 500,
          }}>
            Page {evidence.page}
          </span>
          <span style={{
            marginLeft: 'auto',
            color:      confidencePct >= 80 ? '#4ade80' : confidencePct >= 60 ? '#facc15' : '#94a3b8',
            fontSize:   10,
            fontWeight: 600,
          }}>
            {confidencePct}%
          </span>
        </div>

        {/* Caption (shown when expanded) */}
        {expanded && evidence.reason && (
          <p style={{
            fontSize:  12,
            color:     '#94a3b8',
            marginTop: 8,
            lineHeight: 1.5,
          }}>
            {evidence.reason}
          </p>
        )}

        {!expanded && (
          <p style={{
            fontSize:  11,
            color:     '#4b5563',
            marginTop: 5,
            whiteSpace: 'nowrap',
            overflow:  'hidden',
            textOverflow: 'ellipsis',
          }}>
            {evidence.reason}
          </p>
        )}
      </div>
    </div>
  )
}

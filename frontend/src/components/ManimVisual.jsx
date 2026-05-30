import { useState } from 'react'
import Button from '@/components/ui/Button'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export default function ManimVisual({ topic = '', context = '' }) {
  const [loading,   setLoading]   = useState(false)
  const [imageUrl,  setImageUrl]  = useState(null)
  const [code,      setCode]      = useState(null)
  const [error,     setError]     = useState(null)
  const [showCode,  setShowCode]  = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [status,    setStatus]    = useState(null)

  async function generate() {
    setLoading(true); setError(null); setImageUrl(null); setCode(null); setStatus(null)
    try {
      const res = await fetch(`${API_BASE}/generate-visual`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ topic, context }),
      })
      const data = await res.json()

      setStatus(data.status)
      if (data.image_url) setImageUrl(data.image_url)
      if (data.code)      setCode(data.code)
      if (data.status === 'error') setError('Rendering failed. See fallback below.')

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function downloadCode() {
    const blob = new Blob([code], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${(topic || 'scene').replace(/\s+/g, '_')}_manim.py`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e1e2a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#5bff9b', fontSize: 16 }}>◈</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#ccc' }}>Manim Visual Explanation</span>
          {topic && <span style={{ fontSize: 11, color: '#555' }}>— {topic}</span>}
        </div>
        <Button variant="primary" size="sm" loading={loading}
          onClick={generate} disabled={!topic.trim() || loading}>
          {loading ? 'Rendering...' : '▶ Generate Visual'}
        </Button>
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 14, color: '#9b6dff', marginBottom: 8, fontWeight: 500 }}>
              Generating Manim animation for <em style={{ color: '#c4a8ff' }}>{topic}</em>
            </div>
            <div style={{ fontSize: 12, color: '#555', marginBottom: 20 }}>
              Step 1: AI writes Manim code → Step 2: Manim renders image
            </div>
            <LoadingBar />
            <div style={{ fontSize: 11, color: '#333', marginTop: 12 }}>
              Usually takes 20–60 seconds
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ background: '#1a1010', border: '1px solid #4d1515', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: '#ff9b5b', margin: 0 }}>⚠ {error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !imageUrl && !error && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#444' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 14, color: '#666' }}>
              Generate a 3Blue1Brown-style Manim visual
            </div>
            <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>
              AI writes the Manim code → Manim renders a high-quality image
            </div>
          </div>
        )}

        {/* Rendered image */}
        {imageUrl && !loading && (
          <div style={{ animation: 'fadeUp 0.25s ease-out' }}>
            <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: '#5bff9b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ✓ Manim Visualization Generated
              </span>
              <Button variant="ghost" size="sm" onClick={generate}>↺ Regenerate</Button>
            </div>

            <img
              src={imageUrl}
              alt={topic}
              style={{
                width: '100%',
                borderRadius: 10,
                border: '1px solid #1e1e2a',
                display: 'block',
              }}
              onError={e => {
                e.target.style.display = 'none'
                setError('Image failed to load. The render may still be processing.')
              }}
            />

            {/* Code section */}
            {code && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <button onClick={() => setShowCode(!showCode)}
                    style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontFamily: 'monospace' }}>&lt;/&gt;</span>
                    <span>Manim Python Code</span>
                    <span style={{ fontSize: 10 }}>{showCode ? '▲' : '▼'}</span>
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="ghost" size="sm" onClick={copyCode}>
                      {copied ? '✓ Copied' : 'Copy'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadCode}>↓ Download .py</Button>
                  </div>
                </div>

                {showCode && (
                  <pre style={{
                    background: '#0a0a0e', border: '1px solid #1e1e2a', borderRadius: 8,
                    padding: 14, overflowX: 'auto', fontSize: 11, lineHeight: 1.6,
                    color: '#c4a8ff', fontFamily: '"JetBrains Mono","Fira Code",monospace',
                    maxHeight: 400, overflowY: 'auto',
                  }}>
                    <code>{code}</code>
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingBar() {
  return (
    <div style={{ width: 260, height: 3, background: '#1e1e2a', borderRadius: 2, margin: '0 auto', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: '35%',
        background: 'linear-gradient(90deg, #9b6dff, #5bbdff)',
        borderRadius: 2,
        animation: 'lbar 1.8s ease-in-out infinite',
      }} />
      <style>{`@keyframes lbar{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  )
}
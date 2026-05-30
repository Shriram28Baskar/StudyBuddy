import { useState } from 'react'
import { mindMapAPI } from '@/services/api'
import useAppStore, { selectMindmap } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const NODE_COLORS = ['#9b6dff', '#5bbdff', '#ff9b5b', '#5bff9b', '#ff5b9b', '#ffdb5b', '#5bdfff']

export default function MindMap() {
  const storedMap  = useAppStore(selectMindmap)
  const setMindmap = useAppStore((s) => s.setMindmap)
  const showToast  = useAppStore((s) => s.showToast)

  const [topic,   setTopic]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [expanded, setExpanded] = useState({})

  const data = storedMap

  async function handleGenerate() {
    if (!topic.trim()) { setError('Enter a topic first.'); return }
    setLoading(true); setError(null)
    try {
      const res = await mindMapAPI.generate({ topic })
      setMindmap({ topic: res.data.topic, nodes: res.data.nodes })
      setExpanded({})
      showToast('Mind map generated!', 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleNode = (name) => setExpanded(prev => ({ ...prev, [name]: !prev[name] }))

  return (
    <div style={{ maxWidth: 860, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>Mind Map</h1>
        <p style={{ color: '#555', fontSize: 13 }}>Break any concept into a structured visual map instantly.</p>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerate()}
          placeholder="Enter a topic (e.g. Neural Networks, Thermodynamics, French Revolution...)"
          style={{ flex: 1, background: '#14121a', border: '1px solid #2a2a38', borderRadius: 10, padding: '11px 14px', color: '#ccc', fontSize: 14, outline: 'none' }} />
        <Button variant="primary" loading={loading} onClick={handleGenerate}>
          {loading ? 'Generating...' : 'Generate'}
        </Button>
      </div>
      {error && <p style={{ color: '#ff5b5b', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {/* Mind map output */}
      {data && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
          {/* Central topic */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{ background: 'linear-gradient(135deg,#5c35aa,#9b6dff)', borderRadius: 24, padding: '10px 28px', fontSize: 16, fontWeight: 600, color: '#fff', letterSpacing: '-0.3px' }}>
              {data.topic}
            </div>
          </div>

          {/* Nodes grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {(data.nodes ?? []).map((node, i) => {
              const color   = NODE_COLORS[i % NODE_COLORS.length]
              const isOpen  = expanded[node.name] !== false   // default open
              const initial = expanded[node.name] === undefined

              return (
                <div key={i} style={{ background: '#14121a', border: `1px solid ${color}28`, borderRadius: 12, overflow: 'hidden', animation: `fadeUp 0.2s ease-out ${i * 0.04}s both` }}>
                  {/* Node header */}
                  <button
                    onClick={() => toggleNode(node.name)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: `1px solid ${isOpen || initial ? color + '20' : 'transparent'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: color, textAlign: 'left' }}>{node.name}</span>
                    </div>
                    <span style={{ color: '#444', fontSize: 11, transition: 'transform 0.2s', transform: (isOpen || initial) ? 'rotate(0)' : 'rotate(-90deg)' }}>▾</span>
                  </button>

                  {/* Children */}
                  {(isOpen || initial) && (
                    <div style={{ padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(node.children ?? []).map((child, j) => (
                        <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: color, opacity: 0.5, marginTop: 6, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: '#aaa', lineHeight: 1.5 }}>{child}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <Button variant="ghost" size="sm" onClick={() => setExpanded({})}>Expand All</Button>
            <Button variant="ghost" size="sm" onClick={() => {
              const closed = {}
              data.nodes?.forEach(n => { closed[n.name] = false })
              setExpanded(closed)
            }}>Collapse All</Button>
            <Button variant="ghost" size="sm" onClick={() => { setMindmap(null); setTopic('') }}>Clear</Button>
          </div>
        </div>
      )}

      {!data && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◈</div>
          <div style={{ fontSize: 14 }}>Enter any topic to generate a structured mind map</div>
        </div>
      )}
    </div>
  )
}
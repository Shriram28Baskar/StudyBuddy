import { useState } from 'react'
import { careerAPI } from '@/services/api'
import useAppStore, { selectCareer } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'

const BADGE_VARIANTS = ['brand', 'blue', 'green', 'orange', 'pink']
const matchColor = (pct) => pct >= 80 ? '#5bff9b' : pct >= 60 ? '#ffdb5b' : '#ff9b5b'

export default function Career() {
  const storedCareer = useAppStore(selectCareer)
  const setCareer    = useAppStore((s) => s.setCareer)
  const showToast    = useAppStore((s) => s.showToast)

  const [skills,    setSkills]    = useState('')
  const [interests, setInterests] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const roles = storedCareer?.roles ?? []

  async function handleGenerate() {
    const skillList    = skills.split(',').map(s => s.trim()).filter(Boolean)
    const interestList = interests.split(',').map(s => s.trim()).filter(Boolean)
    if (skillList.length === 0) { setError('Enter at least one skill.'); return }
    setLoading(true); setError(null)
    try {
      const res = await careerAPI.getGuidance({ skills: skillList, interests: interestList })
      setCareer({ roles: res.data.roles })
      showToast('Career paths generated!', 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>Career Guidance</h1>
        <p style={{ color: '#555', fontSize: 13 }}>Discover role matches based on your skills — powered by live market data.</p>
      </div>

      <Card style={{ marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {[
            { label: 'Your Skills', value: skills, set: setSkills, placeholder: 'Python, ML, React...' },
            { label: 'Interests',   value: interests, set: setInterests, placeholder: 'AI, startups, research...' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>{label}</label>
              <input value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
                style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
        {error && <p style={{ color: '#ff5b5b', fontSize: 12, marginBottom: 12 }}>{error}</p>}
        <Button variant="primary" loading={loading} onClick={handleGenerate}>
          {loading ? 'Analysing market...' : 'Find Career Paths'}
        </Button>
      </Card>

      {roles.length > 0 && (
        <>
          <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>{roles.length} roles matched</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {roles.map((role, i) => {
              const mc = matchColor(role.match)
              return (
                <div key={i} style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 12, animation: `fadeUp 0.2s ease-out ${i * 0.05}s both`, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#2a2a38'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#1e1e2a'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#e8e4f0' }}>{role.title}</div>
                    <div style={{ fontSize: 13, color: mc, background: `${mc}18`, borderRadius: 6, padding: '2px 8px', fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{role.match}%</div>
                  </div>
                  <div style={{ height: 3, background: '#1e1e2a', borderRadius: 2 }}>
                    <div style={{ width: `${role.match}%`, height: '100%', background: mc, borderRadius: 2 }} />
                  </div>
                  {role.salary && <div style={{ fontSize: 12, color: '#888' }}>◆ {role.salary}</div>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {(role.skills ?? []).map((s, j) => <Badge key={j} variant={BADGE_VARIANTS[j % BADGE_VARIANTS.length]} size="sm">{s}</Badge>)}
                  </div>
                  {role.nextStep && (
                    <div style={{ borderTop: '1px solid #1e1e2a', paddingTop: 10, fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                      <span style={{ color: '#444' }}>Next → </span>{role.nextStep}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {roles.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◆</div>
          <div style={{ fontSize: 14 }}>Enter your skills above to discover matched career paths</div>
        </div>
      )}
    </div>
  )
}
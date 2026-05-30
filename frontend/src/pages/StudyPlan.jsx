import { useState } from 'react'
import { studyPlanAPI } from '@/services/api'
import useAppStore, { selectStudyPlan } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const SUBJECT_COLORS = {
  Mathematics: '#9b6dff', Physics: '#5bbdff', Chemistry: '#ff9b5b',
  Biology: '#5bff9b', 'Computer Science': '#ff5b9b', History: '#ffdb5b',
  Economics: '#5bdfff', English: '#ff9b5b', Default: '#888',
}
const subjectColor = (sub) => {
  for (const [key, val] of Object.entries(SUBJECT_COLORS)) {
    if (sub.toLowerCase().includes(key.toLowerCase())) return val
  }
  return SUBJECT_COLORS.Default
}

export default function StudyPlan() {
  const storedPlan  = useAppStore(selectStudyPlan)
  const setStudyPlan = useAppStore((s) => s.setStudyPlan)
  const showToast   = useAppStore((s) => s.showToast)

  const today = new Date().toISOString().split('T')[0]
  const [exam,     setExam]     = useState('')
  const [subjects, setSubjects] = useState('')
  const [examDate, setExamDate] = useState('')
  const [hours,    setHours]    = useState(4)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const plan = storedPlan

  async function handleGenerate() {
    if (!exam.trim())    { setError('Enter an exam name.'); return }
    if (!examDate)       { setError('Select an exam date.'); return }
    const subList = subjects.split(',').map(s => s.trim()).filter(Boolean)
    if (subList.length === 0) { setError('Enter at least one subject.'); return }
    setLoading(true); setError(null)
    try {
      const res = await studyPlanAPI.generate({
        exam, subjects: subList, examDate, hoursPerDay: hours,
      })
      setStudyPlan({ plan: res.data.plan, summary: res.data.summary })
      showToast('Study plan generated!', 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Cap visible plan to 7 days in the calendar grid, show rest in list
  const visibleDays  = (plan?.plan ?? []).slice(0, 7)
  const extraDays    = (plan?.plan ?? []).slice(7)

  return (
    <div style={{ maxWidth: 960, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>Study Plan</h1>
        <p style={{ color: '#555', fontSize: 13 }}>Generate a personalised day-wise study schedule tailored to your exam.</p>
      </div>

      {/* Form */}
      <Card style={{ marginBottom: 28 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Exam / Goal</label>
            <input value={exam} onChange={e => setExam(e.target.value)} placeholder="e.g. JEE Mains, GATE, CAT..."
              style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Exam Date</label>
            <input type="date" value={examDate} min={today} onChange={e => setExamDate(e.target.value)}
              style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: examDate ? '#ccc' : '#444', fontSize: 13, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Subjects (comma-separated)</label>
            <input value={subjects} onChange={e => setSubjects(e.target.value)} placeholder="Math, Physics, Chemistry..."
              style={{ width: '100%', background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              Hours per Day: <span style={{ color: '#9b6dff' }}>{hours}h</span>
            </label>
            <input type="range" min="2" max="12" step="0.5" value={hours} onChange={e => setHours(Number(e.target.value))}
              style={{ width: '100%', marginTop: 10, accentColor: '#9b6dff' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444', marginTop: 2 }}>
              <span>2h</span><span>12h</span>
            </div>
          </div>
        </div>
        {error && <p style={{ color: '#ff5b5b', fontSize: 12, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" loading={loading} onClick={handleGenerate}>
            {loading ? 'Generating plan...' : 'Generate Study Plan'}
          </Button>
          {plan && <Button variant="ghost" onClick={() => setStudyPlan(null)}>Clear</Button>}
        </div>
      </Card>

      {/* Plan output */}
      {plan && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
          {/* Summary */}
          {plan.summary && (
            <div style={{ background: '#14121a', border: '1px solid #3d2060', borderRadius: 10, padding: '12px 16px', marginBottom: 20, borderLeft: '3px solid #9b6dff' }}>
              <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, margin: 0 }}>{plan.summary}</p>
            </div>
          )}

          {/* 7-day grid */}
          <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Week {Math.ceil(visibleDays.length / 7)} — First {visibleDays.length} Days
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(7, visibleDays.length)},1fr)`, gap: 8, marginBottom: 20 }}>
            {visibleDays.map((day, i) => (
              <div key={i} style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 10, padding: '12px 10px', minHeight: 140, animation: `fadeUp 0.15s ease-out ${i * 0.04}s both` }}>
                <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{day.date}</div>
                <div style={{ fontSize: 12, color: '#ccc', fontWeight: 600, marginBottom: 10 }}>{day.day}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {(day.tasks ?? []).map((task, j) => {
                    const color = subjectColor(task.subject)
                    return (
                      <div key={j} style={{ background: '#0f0f13', borderRadius: 5, padding: '5px 7px', borderLeft: `2px solid ${color}` }}>
                        <div style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 1 }}>{task.subject}</div>
                        <div style={{ fontSize: 10, color: '#777', lineHeight: 1.3 }}>{task.topic}</div>
                        <div style={{ fontSize: 9, color: '#444', marginTop: 2 }}>{task.hours}h</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Extra days in list format */}
          {extraDays.length > 0 && (
            <div>
              <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Remaining {extraDays.length} Days</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {extraDays.map((day, i) => (
                  <div key={i} style={{ background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, width: 60 }}>
                      <div style={{ fontSize: 10, color: '#555' }}>{day.date}</div>
                      <div style={{ fontSize: 13, color: '#ccc', fontWeight: 600 }}>{day.day}</div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
                      {(day.tasks ?? []).map((task, j) => {
                        const color = subjectColor(task.subject)
                        return (
                          <div key={j} style={{ background: '#0f0f13', border: `1px solid ${color}20`, borderRadius: 6, padding: '5px 10px', borderLeft: `2px solid ${color}` }}>
                            <span style={{ fontSize: 11, color, fontWeight: 600 }}>{task.subject}</span>
                            <span style={{ fontSize: 11, color: '#555', marginLeft: 6 }}>{task.topic}</span>
                            <span style={{ fontSize: 10, color: '#444', marginLeft: 6 }}>{task.hours}h</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!plan && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#444' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◷</div>
          <div style={{ fontSize: 14 }}>Fill in the form above to generate your study plan</div>
        </div>
      )}
    </div>
  )
}
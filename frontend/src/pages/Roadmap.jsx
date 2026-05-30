import { useState, useCallback, useRef, useEffect } from 'react'
import { roadmapAPI } from '@/services/api'
import useAppStore, { selectRoadmap } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const PHASE_COLORS = ['#9b6dff', '#5bbdff', '#ff9b5b', '#5bff9b', '#ff5b9b', '#ffdb5b']
const BADGE_VARIANTS = ['brand', 'blue', 'orange', 'green', 'pink', 'yellow']
const MAX_RETRY_ATTEMPTS = 3

// Resource type icons with case-insensitive matching
const TYPE_ICONS = {
  course: '🎓',
  book: '📚',
  video: '▶',
  documentation: '📖',
  practice: '⌨',
  article: '📄',
  tutorial: '📘',
  website: '🌐'
}

const getResourceIcon = (type) => {
  const normalizedType = (type || 'article').toLowerCase()
  return TYPE_ICONS[normalizedType] || '🔗'
}

export default function Roadmap() {
  const storedRoadmap = useAppStore(selectRoadmap)
  const setRoadmap = useAppStore((s) => s.setRoadmap)
  const showToast = useAppStore((s) => s.showToast)

  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [inputFocus, setInputFocus] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const roadmapGeneratedRef = useRef(false)
  const roadmapContainerRef = useRef(null)

  const roadmap = storedRoadmap
  const phases = roadmap?.phases || []
  const completionPercentage = roadmap?.progress?.completion_percentage || 0

  // Auto-scroll to roadmap after generation - using ref instead of querySelector
  useEffect(() => {
    if (roadmap && !loading && phases.length > 0 && roadmapGeneratedRef.current) {
      setTimeout(() => {
        if (roadmapContainerRef.current) {
          roadmapContainerRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          })
        }
        roadmapGeneratedRef.current = false
      }, 100)
    }
  }, [roadmap, loading, phases])

  const handleGenerate = useCallback(async () => {
    const trimmedGoal = goal.trim()
    if (!trimmedGoal) {
      setError('Please enter a learning goal.')
      return
    }

    // Check retry limit
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      setError(`Too many failed attempts (${MAX_RETRY_ATTEMPTS}). Please try again later or refresh the page.`)
      return
    }

    setLoading(true)
    setError(null)
    roadmapGeneratedRef.current = true

    try {
      const res = await roadmapAPI.generate({ goal: trimmedGoal })
      const data = res?.data || {}

      setRoadmap({
        goal: data.goal || trimmedGoal,
        phases: data.phases || [],
        estimatedTime: data.estimatedTime || null,
        progress: data.progress || { completion_percentage: 0 }
      })

      if (showToast) {
        showToast('Roadmap generated successfully!', 'success')
      }

      setRetryCount(0)
      // Optional: clear input after successful generation
      // setGoal('')
    } catch (err) {
      const errorMessage = err?.message ||
                          err?.response?.data?.detail ||
                          'Failed to generate roadmap. Please try again.'
      setError(errorMessage)
      if (showToast) {
        showToast(errorMessage, 'error')
      }
      setRetryCount(prev => prev + 1)
    } finally {
      setLoading(false)
    }
  }, [goal, retryCount, setRoadmap, showToast])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !loading && goal.trim()) {
      e.preventDefault()
      handleGenerate()
    }
  }, [loading, goal, handleGenerate])

  const handleRetry = useCallback(() => {
    if (!loading && retryCount < MAX_RETRY_ATTEMPTS) {
      handleGenerate()
    }
  }, [loading, retryCount, handleGenerate])

  const handleClear = useCallback(() => {
    setRoadmap(null)
    setGoal('')
    setError(null)
    setRetryCount(0)
    roadmapGeneratedRef.current = false
  }, [setRoadmap])

  // Safely render resource with proper parsing and stable keys
  const renderResource = useCallback((resource, index, color) => {
    if (!resource) return null

    let resourceTitle = ''
    let resourceLink = null
    let resourceType = 'article'
    let resourceDescription = ''

    if (typeof resource === 'object' && resource !== null) {
      resourceTitle = resource.title || resource.name || ''
      resourceLink = resource.url || resource.link || null
      resourceType = resource.type || 'article'
      resourceDescription = resource.description || ''
    } else if (typeof resource === 'string') {
      resourceTitle = resource
    }

    if (!resourceTitle) return null

    const icon = getResourceIcon(resourceType)
    // Stable key using title + index as fallback
    const stableKey = `${resourceTitle}-${index}`.replace(/\s+/g, '-').toLowerCase()

    return (
      <div
        key={stableKey}
        className="resource-item"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '8px 12px',
          background: '#0f0f13',
          borderRadius: 8,
          borderLeft: `2px solid ${color}`,
          transition: 'transform 0.15s'
        }}
      >
        <span style={{ fontSize: 14 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          {resourceLink ? (
            <a
              href={resourceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="resource-link"
              style={{
                fontSize: 12,
                color: '#ddd',
                textDecoration: 'none',
                transition: 'color 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = color}
              onMouseLeave={(e) => e.currentTarget.style.color = '#ddd'}
            >
              {resourceTitle}
            </a>
          ) : (
            <span style={{ fontSize: 12, color: '#ddd' }}>{resourceTitle}</span>
          )}
          {resourceDescription && (
            <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
              {resourceDescription}
            </div>
          )}
          {resourceType && resourceType !== 'article' && (
            <span style={{
              fontSize: 9,
              color: '#555',
              marginLeft: 8,
              textTransform: 'uppercase'
            }}>
              {resourceType}
            </span>
          )}
        </div>
      </div>
    )
  }, [])

  const isValidGoal = goal.trim().length > 0
  const canGenerate = !loading && isValidGoal && retryCount < MAX_RETRY_ATTEMPTS
  const showRetryButton = error && !loading && retryCount < MAX_RETRY_ATTEMPTS

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .resource-item:hover {
          transform: translateX(4px);
        }

        .resource-link:hover {
          text-decoration: underline !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>
          Learning Roadmap
        </h1>
        <p style={{ color: '#555', fontSize: 13 }}>
          Generate a complete learning path for any topic
        </p>
      </div>

      {/* Input Section */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
              What do you want to master?
            </label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setInputFocus(false)}
              disabled={loading}
              placeholder="e.g., Machine Learning Engineer, Full Stack Developer, Data Scientist"
              style={{
                width: '100%',
                background: '#14121a',
                border: `1px solid ${inputFocus ? '#9b6dff' : '#2a2a38'}`,
                borderRadius: 10,
                padding: '12px 16px',
                color: '#ccc',
                fontSize: 14,
                outline: 'none',
                transition: 'all 0.15s',
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'text'
              }}
            />
          </div>
          <Button
            variant="primary"
            loading={loading}
            onClick={handleGenerate}
            disabled={!canGenerate}
            style={{ height: 46, minWidth: 100 }}
          >
            {loading ? 'Generating...' : 'Generate Roadmap'}
          </Button>
        </div>

        {error && (
          <div style={{
            background: '#2a0d0d',
            border: '1px solid #4d1515',
            borderRadius: 8,
            padding: '12px 16px',
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <span style={{ color: '#ff9b5b', fontSize: 13 }}>⚠ {error}</span>
            {showRetryButton && (
              <button
                onClick={handleRetry}
                disabled={loading}
                style={{
                  background: '#5c35aa',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 16px',
                  color: '#fff',
                  fontSize: 12,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: loading ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.background = '#6d4bc9'
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.background = '#5c35aa'
                }}
              >
                {loading ? 'Retrying...' : 'Retry'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 14, color: '#9b6dff', marginBottom: 8 }}>Crafting your personalized learning path...</div>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 20 }}>Analyzing best resources and structuring your journey</div>
          <div style={{ width: 260, height: 3, background: '#1e1e2a', borderRadius: 2, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '35%', background: 'linear-gradient(90deg,#9b6dff,#5bbdff)', borderRadius: 2, animation: 'lbar 1.8s ease-in-out infinite' }} />
          </div>
          <style>{`@keyframes lbar{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
        </div>
      )}

      {/* Roadmap Display */}
      {roadmap && !loading && phases.length > 0 && (
        <div ref={roadmapContainerRef} style={{ animation: 'fadeUp 0.2s ease-out' }}>

          {/* Header with Goal and Progress */}
          <div style={{
            background: 'linear-gradient(135deg, #14121a 0%, #1a1428 100%)',
            border: '1px solid #2a2a38',
            borderRadius: 16,
            padding: '24px 28px',
            marginBottom: 28
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Learning Path
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#e8e4f0', fontFamily: '"DM Serif Display",Georgia,serif' }}>
                  {roadmap.goal}
                </div>
                {roadmap.estimatedTime && (
                  <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                    Estimated time: {roadmap.estimatedTime}
                  </div>
                )}
              </div>

              <div style={{ textAlign: 'right' }}>
                <Button variant="ghost" size="sm" onClick={handleClear} disabled={loading}>
                  New Roadmap
                </Button>
                <div style={{ fontSize: 11, color: '#555', marginTop: 8 }}>
                  {completionPercentage}% completed
                </div>
                <div style={{ width: 120, height: 4, background: '#1e1e2a', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${completionPercentage}%`, height: '100%', background: '#5bff9b', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>

          {/* Phases Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {phases.map((phase, i) => {
              const color = PHASE_COLORS[i % PHASE_COLORS.length]
              const bVariant = BADGE_VARIANTS[i % BADGE_VARIANTS.length]
              const isLast = i === phases.length - 1
              const phaseSkills = phase?.skills || []
              const phaseResources = phase?.resources || []
              const phaseId = phase?.id || `phase-${i}`

              return (
                <div key={phaseId} style={{ display: 'flex', gap: 20, position: 'relative', paddingBottom: isLast ? 0 : 24 }}>

                  {/* Timeline Connector Line */}
                  {!isLast && (
                    <div style={{
                      position: 'absolute',
                      left: 17,
                      top: 48,
                      width: 2,
                      height: 'calc(100% - 24px)',
                      background: `linear-gradient(180deg, ${color} 0%, #1e1e2a 100%)`,
                      zIndex: 0
                    }} />
                  )}

                  {/* Timeline Dot */}
                  <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#0a0a0e',
                      boxShadow: `0 0 0 4px #14121a`
                    }}>
                      {i + 1}
                    </div>
                  </div>

                  {/* Phase Content */}
                  <div style={{
                    flex: 1,
                    background: '#14121a',
                    border: `1px solid ${color}30`,
                    borderRadius: 16,
                    padding: '20px 24px',
                    transition: 'all 0.2s',
                    position: 'relative',
                    zIndex: 1
                  }}>
                    {/* Phase Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 11, color: color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                          {phase.phase || `Step ${i + 1}`}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e4f0' }}>
                          {phase.title || 'Untitled Phase'}
                        </div>
                      </div>
                      {phase.duration && (
                        <div style={{
                          fontSize: 11,
                          color: color,
                          background: `${color}10`,
                          border: `1px solid ${color}30`,
                          borderRadius: 20,
                          padding: '4px 12px',
                          fontWeight: 500
                        }}>
                          ⏱ {phase.duration}
                        </div>
                      )}
                    </div>

                    {/* Description / Overview */}
                    {phase.description && (
                      <div style={{
                        fontSize: 13,
                        color: '#aaa',
                        lineHeight: 1.6,
                        marginBottom: 16,
                        padding: '12px 0',
                        borderTop: '1px solid #1e1e2a',
                        borderBottom: '1px solid #1e1e2a'
                      }}>
                        {phase.description}
                      </div>
                    )}

                    {/* Skills Section */}
                    {phaseSkills.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          📚 Skills to Master
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {phaseSkills.map((skill, skillIdx) => (
                            <Badge key={`skill-${i}-${skillIdx}`} variant={bVariant} size="sm" style={{ fontSize: 11 }}>
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resources Section */}
                    {phaseResources.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          📖 Recommended Resources
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {phaseResources
                            .map((resource, resourceIdx) => renderResource(resource, resourceIdx, color))
                            .filter(Boolean)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer - Next Steps */}
          <div style={{
            marginTop: 32,
            padding: '20px 24px',
            background: '#0f0f13',
            border: '1px solid #1e1e2a',
            borderRadius: 12,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 12, color: '#666' }}>
              💡 Ready to start? Begin with <strong style={{ color: '#9b6dff' }}>{phases[0]?.title || 'Step 1'}</strong> and check off each skill as you progress.
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 12 }}>
              Track your progress, bookmark resources, and share your roadmap with peers!
            </div>
          </div>
        </div>
      )}

      {/* Empty State - No Roadmap */}
      {!roadmap && !loading && phases.length === 0 && !error && (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: '#14121a',
          border: '1px solid #1e1e2a',
          borderRadius: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🗺️</div>
          <div style={{ fontSize: 16, color: '#888', marginBottom: 8 }}>Enter a topic above to generate your learning roadmap</div>
          <div style={{ fontSize: 13, color: '#555' }}>Example: "Machine Learning Engineer", "Full Stack Developer", "Data Scientist"</div>
        </div>
      )}

      {/* Empty State - Roadmap with no phases */}
      {roadmap && !loading && phases.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#14121a',
          border: '1px solid #ff9b5b30',
          borderRadius: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, color: '#ff9b5b', marginBottom: 12 }}>No roadmap data available</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 20 }}>The generated roadmap returned empty phases. Please try again.</div>
          <Button variant="primary" onClick={handleRetry} disabled={loading}>
            {loading ? 'Retrying...' : 'Try Again'}
          </Button>
        </div>
      )}
    </div>
  )
}
import { useState, useRef, useEffect } from 'react'
import { documentsAPI } from '@/services/api'
import useAppStore, { selectDocuments } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import MathMarkdown from '@/components/MathMarkdown'
import VisualEvidenceCard from '@/components/VisualEvidenceCard'

export default function Documents() {
  const docs              = useAppStore(selectDocuments)
  const addDocument       = useAppStore((s) => s.addDocument)
  const removeDoc         = useAppStore((s) => s.removeDocument)
  const setDocumentTopics = useAppStore((s) => s.setDocumentTopics)
  const showToast         = useAppStore((s) => s.showToast)

  const [activeDoc,  setActiveDoc]  = useState(null)
  const [question,   setQuestion]   = useState('')
  const [answer,     setAnswer]     = useState(null)
  const [sources,    setSources]    = useState([])
  const [visualEvidence, setVisualEvidence] = useState([])
  const [pageRefs,   setPageRefs]   = useState([])
  const [queryIntent, setQueryIntent] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [insufficientEvidence, setInsufficientEvidence] = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [querying,   setQuerying]   = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [error,      setError]      = useState(null)
  const [loadingTopics, setLoadingTopics] = useState(false)

  const fileRef = useRef()

  // Fetch topics if the selected document doesn't have them yet
  useEffect(() => {
    if (!activeDoc) return
    const current = docs.find(d => d.docId === activeDoc)
    if (current && (!current.topics || current.topics.length === 0)) {
      setLoadingTopics(true)
      documentsAPI.getTopics(activeDoc, current.filename)
        .then(res => {
          if (res.data.topics && res.data.topics.length > 0) {
            setDocumentTopics(activeDoc, res.data.topics)
          }
        })
        .catch(err => {
          console.error('Failed to fetch topics:', err)
        })
        .finally(() => {
          setLoadingTopics(false)
        })
    }
  }, [activeDoc, docs, setDocumentTopics])

  async function handleUpload(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const allowed = ['pdf', 'txt', 'md', 'docx', 'pptx', 'csv', 'xlsx', 'xls', 'json', 'png', 'jpg', 'jpeg']
    if (!allowed.includes(ext)) {
      setError(`Unsupported file type. Allowed: ${allowed.join(', ')}`)
      return
    }
    setUploading(true); setUploadPct(0); setError(null)
    try {
      const res = await documentsAPI.upload(file, setUploadPct)
      addDocument({
        docId: res.data.doc_id,
        filename: res.data.filename,
        chunkCount: res.data.chunk_count,
        imageCount: res.data.image_count || 0,
        topics: res.data.topics || []
      })
      setActiveDoc(res.data.doc_id)
      const imgMsg = res.data.image_count > 0 ? ` · ${res.data.image_count} visuals indexed` : ''
      showToast(`"${res.data.filename}" uploaded — ${res.data.chunk_count} chunks${imgMsg}`, 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false); setUploadPct(0)
    }
  }

  async function runQuery(customQuestion) {
    const qText = customQuestion || question
    if (!qText.trim() || !activeDoc) return
    setQuerying(true)
    setAnswer(null)
    setSources([])
    setVisualEvidence([])
    setPageRefs([])
    setQueryIntent(null)
    setConfidence(null)
    setInsufficientEvidence(false)
    setError(null)
    try {
      const res = await documentsAPI.query({ question: qText, collection: activeDoc })
      const d = res.data
      setAnswer(d.answer || 'No answer generated.')
      setSources(d.sources || [])
      setVisualEvidence(d.visual_evidence || [])
      setPageRefs(d.page_refs || [])
      setQueryIntent(d.query_intent || null)
      setConfidence(d.retrieval_confidence || null)
      setInsufficientEvidence(d.insufficient_evidence || false)
    } catch (err) {
      setError(err.message)
    } finally {
      setQuerying(false)
    }
  }

  async function handleQuery() {
    await runQuery(question)
  }

  const handleTopicClick = (topic) => {
    const qText = `Explain the topic "${topic.title}" in detail, covering: ${topic.subtopics.join(', ')}`
    setQuestion(qText)
    runQuery(qText)
  }

  const selectedDoc = docs.find(d => d.docId === activeDoc)

  return (
    <div style={{ maxWidth: 800, animation: 'fadeUp 0.2s ease-out' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: '"DM Serif Display",Georgia,serif', fontWeight: 400, fontSize: 28, color: '#e8e4f0', marginBottom: 4 }}>Document Q&A</h1>
        <p style={{ color: '#555', fontSize: 13 }}>Upload a document, ask questions, and generate visual explanations.</p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files[0]) }}
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          background: dragOver ? '#1a1428' : '#14121a',
          border: `2px dashed ${dragOver ? '#9b6dff' : '#2a2a38'}`,
          borderRadius: 12, padding: '32px 24px', textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer', marginBottom: 20,
          transition: 'all 0.15s',
        }}>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files[0])} />
        <div style={{ fontSize: 28, color: '#3d2060', marginBottom: 10 }}>⊡</div>
        {uploading ? (
          <div>
            <div style={{ fontSize: 13, color: '#aaa', marginBottom: 10 }}>Uploading and indexing... {uploadPct}%</div>
            <div style={{ height: 4, background: '#1e1e2a', borderRadius: 2, width: 200, margin: '0 auto' }}>
              <div style={{ width: `${uploadPct}%`, height: '100%', background: '#9b6dff', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 14, color: '#888' }}>Drop a file here or click to upload</div>
            <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>Supports .pdf · .txt · .md · .docx · .pptx · .csv — max 10 MB</div>
          </>
        )}
      </div>

      {/* Choose a document grid */}
      {docs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Choose a document</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {docs.map(doc => {
              const isActive = activeDoc === doc.docId
              const topicCount = doc.topics?.length ?? 0
              return (
                <div key={doc.docId}
                  onClick={() => { setActiveDoc(doc.docId); setAnswer(null); setSources([]); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px', background: '#14121a',
                    border: `2px solid ${isActive ? '#00c2a8' : '#1e1e2a'}`,
                    borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s ease',
                    boxShadow: isActive ? '0 0 12px rgba(0, 194, 168, 0.05)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, background: '#ff3b301a',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, color: '#ff3b30'
                    }}>
                      📄
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#e8e4f0', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.filename}</div>
                      <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>
                        {topicCount > 0 
                          ? `${topicCount} topics extracted` 
                          : (isActive && loadingTopics) ? 'extracting topics...' : '0 topics extracted'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isActive ? (
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', background: '#00c2a822',
                        border: '1px solid #00c2a8', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', color: '#00c2a8', fontSize: 11, fontWeight: 700
                      }}>
                        ✓
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); removeDoc(doc.docId); if (activeDoc === doc.docId) { setActiveDoc(null); setAnswer(null) } }}
                        style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 16, padding: '4px' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ff5b5b'}
                        onMouseLeave={e => e.currentTarget.style.color = '#444'}>
                        ×
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Select a topic to study list */}
      {selectedDoc && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Select a topic to study</p>
          {loadingTopics ? (
            <div style={{ padding: '20px 0', color: '#666', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 16, border: '2px solid #2a2a3a', borderTopColor: '#9b6dff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              Extracting syllabus topics from document...
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          ) : selectedDoc.topics && selectedDoc.topics.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedDoc.topics.map((topic, i) => (
                <div
                  key={i}
                  onClick={() => handleTopicClick(topic)}
                  style={{
                    display: 'flex', flexDirection: 'column', padding: '16px 20px',
                    background: '#14121a', border: '1px solid #1e1e2a', borderRadius: 12,
                    cursor: 'pointer', transition: 'all 0.15s ease', position: 'relative',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#9b6dff44'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(155, 109, 255, 0.05)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#1e1e2a'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ color: '#00c2a8', fontSize: 16 }}>📖</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e4f0' }}>{topic.title}</span>
                    </div>
                    <span style={{ color: '#555', fontSize: 14 }}>＞</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px 26px', lineHeight: 1.5 }}>
                    {topic.description}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 26 }}>
                    {topic.subtopics.map((sub, j) => (
                      <span key={j} style={{
                        padding: '4px 10px', borderRadius: 6, background: '#1c1b22',
                        color: '#666', fontSize: 11, border: '1px solid #2a2a38'
                      }}>
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: '#444', fontSize: 12, padding: '10px 0' }}>No topics extracted. Ask any question in the solver below.</div>
          )}
        </div>
      )}

      {/* Query section */}
      {activeDoc && (
        <Card style={{ marginBottom: 20 }}>
          {selectedDoc && (
            <p style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
              Querying: <span style={{ color: '#9b6dff' }}>{selectedDoc.filename}</span>
            </p>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={question} onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuery()}
              placeholder="Ask a question about your document..."
              style={{ flex: 1, background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 8, padding: '9px 12px', color: '#ccc', fontSize: 13, outline: 'none' }} />
            <Button variant="primary" loading={querying} onClick={handleQuery}>Ask</Button>
          </div>
        </Card>
      )}

      {error && <p style={{ color: '#ff5b5b', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {/* Answer */}
      {answer && (
        <div style={{ animation: 'fadeUp 0.2s ease-out' }}>

          {/* Confidence + intent banner */}
          {(confidence || queryIntent) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap'
            }}>
              {queryIntent && (
                <span style={{
                  background: '#1a1428', border: '1px solid #9b6dff44', borderRadius: 6,
                  fontSize: 11, color: '#9b6dff', padding: '3px 10px', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}>
                  🎯 {queryIntent.replace(/_/g, ' ')}
                </span>
              )}
              {confidence && (
                <span style={{
                  background: confidence === 'high' ? '#0a2a0a' : confidence === 'medium' ? '#2a2000' : '#2a0a0a',
                  border: `1px solid ${confidence === 'high' ? '#22c55e44' : confidence === 'medium' ? '#eab30844' : '#ef444444'}`,
                  borderRadius: 6, fontSize: 11, padding: '3px 10px', fontWeight: 600,
                  color: confidence === 'high' ? '#4ade80' : confidence === 'medium' ? '#fde047' : '#f87171',
                  textTransform: 'uppercase', letterSpacing: '0.05em'
                }}>
                  {confidence === 'high' ? '✓ High Confidence' : confidence === 'medium' ? '~ Medium Confidence' : '⚠ Low Confidence'}
                </span>
              )}
              {pageRefs.length > 0 && (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginLeft: 4 }}>
                  <span style={{ fontSize: 11, color: '#555' }}>Pages:</span>
                  {pageRefs.map(p => (
                    <span key={p} style={{
                      background: '#1e1e2a', borderRadius: 5, fontSize: 11,
                      color: '#94a3b8', padding: '2px 7px', border: '1px solid #2a2a38'
                    }}>p.{p}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Insufficient evidence banner */}
          {insufficientEvidence && (
            <div style={{
              background: '#2a1800', border: '1px solid #f97316', borderRadius: 10,
              padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start'
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fb923c', marginBottom: 2 }}>Insufficient Evidence</div>
                <div style={{ fontSize: 12, color: '#9a6040' }}>The document may not contain enough information to answer this question confidently.</div>
              </div>
            </div>
          )}

          {/* Visual evidence grid */}
          {visualEvidence.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600 }}>
                📊 Visual Evidence from Document
              </p>
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap',
                overflowX: 'auto', paddingBottom: 4
              }}>
                {visualEvidence.map((ev, i) => (
                  <VisualEvidenceCard key={i} evidence={ev} />
                ))}
              </div>
            </div>
          )}

          <Card style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Answer</p>
            <div style={{ marginBottom: 16, color: '#ddd' }}>
              <MathMarkdown content={answer} />
            </div>
          </Card>
        </div>
      )}

      {docs.length === 0 && !uploading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#444' }}>
          <div style={{ fontSize: 13 }}>Upload a document above to start asking questions</div>
        </div>
      )}
    </div>
  )
}
import { useState, useRef } from 'react'
import { documentsAPI } from '@/services/api'
import useAppStore, { selectDocuments } from '@/store/useAppStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import ManimVisual from '@/components/ManimVisual'

export default function Documents() {
  const docs        = useAppStore(selectDocuments)
  const addDocument = useAppStore((s) => s.addDocument)
  const removeDoc   = useAppStore((s) => s.removeDocument)
  const showToast   = useAppStore((s) => s.showToast)

  const [activeDoc,  setActiveDoc]  = useState(null)
  const [question,   setQuestion]   = useState('')
  const [answer,     setAnswer]     = useState(null)
  const [sources,    setSources]    = useState([])
  const [uploading,  setUploading]  = useState(false)
  const [uploadPct,  setUploadPct]  = useState(0)
  const [querying,   setQuerying]   = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [error,      setError]      = useState(null)

  // Manim: track current topic + context for visual generation
  const [manimTopic,   setManimTopic]   = useState('')
  const [manimContext, setManimContext] = useState('')
  const [showManim,    setShowManim]    = useState(false)

  const fileRef = useRef()

  async function handleUpload(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['pdf', 'txt', 'md'].includes(ext)) {
      setError('Only .pdf, .txt, and .md files are supported.')
      return
    }
    setUploading(true); setUploadPct(0); setError(null)
    try {
      const res = await documentsAPI.upload(file, setUploadPct)
      addDocument({ docId: res.data.doc_id, filename: res.data.filename, chunkCount: res.data.chunk_count })
      setActiveDoc(res.data.doc_id)
      showToast(`"${res.data.filename}" uploaded — ${res.data.chunk_count} chunks indexed`, 'success')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false); setUploadPct(0)
    }
  }

  async function handleQuery() {
    if (!question.trim() || !activeDoc) return
    setQuerying(true); setAnswer(null); setSources([]); setError(null); setShowManim(false)
    try {
      const res = await documentsAPI.query({ question, collection: activeDoc })
      setAnswer(res.data.answer)
      setSources(res.data.sources ?? [])
      // Pre-fill manim topic from the question
      setManimTopic(question)
      setManimContext(res.data.answer ?? '')
    } catch (err) {
      setError(err.message)
    } finally {
      setQuerying(false)
    }
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
            <div style={{ fontSize: 12, color: '#444', marginTop: 4 }}>Supports .pdf · .txt · .md — max 10 MB</div>
          </>
        )}
      </div>

      {/* Uploaded docs list */}
      {docs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Your Documents</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {docs.map(doc => (
              <div key={doc.docId}
                onClick={() => { setActiveDoc(doc.docId); setAnswer(null); setSources([]); setShowManim(false) }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: '#14121a',
                  border: `1px solid ${activeDoc === doc.docId ? '#5c35aa' : '#1e1e2a'}`,
                  borderRadius: 8, cursor: 'pointer', transition: 'border-color 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: activeDoc === doc.docId ? '#9b6dff' : '#555', fontSize: 16 }}>⊡</span>
                  <div>
                    <div style={{ fontSize: 13, color: '#ccc' }}>{doc.filename}</div>
                    <div style={{ fontSize: 11, color: '#444' }}>{doc.chunkCount} chunks · {new Date(doc.uploadedAt).toLocaleDateString()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {activeDoc === doc.docId && <Badge variant="brand" size="sm">Active</Badge>}
                  <button onClick={e => { e.stopPropagation(); removeDoc(doc.docId); if (activeDoc === doc.docId) { setActiveDoc(null); setAnswer(null) } }}
                    style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: 14, padding: '2px 6px', borderRadius: 4, transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff5b5b'}
                    onMouseLeave={e => e.currentTarget.style.color = '#444'}>×</button>
                </div>
              </div>
            ))}
          </div>
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
          <Card style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#9b6dff', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Answer</p>
            <p style={{ fontSize: 14, color: '#ddd', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 16 }}>{answer}</p>

            {/* Visual explanation trigger */}
            <div style={{ borderTop: '1px solid #1e1e2a', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 12, color: '#888' }}>Want a visual explanation of this concept?</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowManim(!showManim)}
              >
                {showManim ? 'Hide Visual' : '▶ Generate Visual'}
              </Button>
            </div>
          </Card>

          {/* Source excerpts */}
          {sources.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Source Excerpts</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sources.map((src, i) => (
                  <div key={i} style={{ background: '#0f0f13', border: '1px solid #1e1e2a', borderRadius: 8, padding: '10px 14px', borderLeft: '2px solid #3d2060' }}>
                    <p style={{ fontSize: 12, color: '#666', lineHeight: 1.6, margin: 0 }}>{src}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manim Visual Panel */}
          {showManim && (
            <div style={{ animation: 'fadeUp 0.2s ease-out' }}>
              {/* Editable topic input */}
              <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#555', flexShrink: 0 }}>Topic to visualise:</span>
                <input
                  value={manimTopic}
                  onChange={e => setManimTopic(e.target.value)}
                  placeholder="e.g. Newton's Second Law"
                  style={{ flex: 1, background: '#0f0f13', border: '1px solid #2a2a38', borderRadius: 7, padding: '6px 10px', color: '#ccc', fontSize: 13, outline: 'none' }}
                />
              </div>
              <ManimVisual topic={manimTopic} context={manimContext} />
            </div>
          )}
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
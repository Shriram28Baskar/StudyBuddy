import { useState, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]

/**
 * PdfViewer – renders a PDF page with zoom controls.
 * Host sees page navigation controls; members see read-only synced view.
 *
 * @param {string}   pdfUrl       - URL to fetch the PDF from
 * @param {number}   currentPage  - Current page number (1-indexed)
 * @param {number}   totalPages   - Total pages in the PDF
 * @param {boolean}  isHost       - Whether the current user is the host
 * @param {function} onPageChange - Called with new page number (host only)
 * @param {number}   containerWidth - Available width for rendering
 */
export default function PdfViewer({
  pdfUrl,
  currentPage = 1,
  totalPages = 1,
  isHost = false,
  onPageChange,
  containerWidth = 800,
}) {
  const [zoomIndex, setZoomIndex] = useState(2) // default 100%
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pdfTotalPages, setPdfTotalPages] = useState(totalPages)

  const zoom = ZOOM_LEVELS[zoomIndex]
  const pageWidth = Math.min(containerWidth - 40, 900) * zoom

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setPdfTotalPages(numPages)
    setLoading(false)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((err) => {
    console.error('PDF load error:', err)
    setError('Failed to load PDF document.')
    setLoading(false)
  }, [])

  const handlePrev = useCallback(() => {
    if (currentPage > 1 && onPageChange) onPageChange(currentPage - 1)
  }, [currentPage, onPageChange])

  const handleNext = useCallback(() => {
    if (currentPage < (pdfTotalPages || totalPages) && onPageChange)
      onPageChange(currentPage + 1)
  }, [currentPage, pdfTotalPages, totalPages, onPageChange])

  const handleZoomIn = useCallback(() => {
    setZoomIndex(i => Math.min(i + 1, ZOOM_LEVELS.length - 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomIndex(i => Math.max(i - 1, 0))
  }, [])

  // Keyboard shortcuts for host
  const handleKeyDown = useCallback((e) => {
    if (!isHost) return
    if (e.key === 'ArrowLeft') handlePrev()
    else if (e.key === 'ArrowRight') handleNext()
  }, [isHost, handlePrev, handleNext])

  const effectiveTotalPages = pdfTotalPages || totalPages

  const file = useMemo(() => ({ url: pdfUrl }), [pdfUrl])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: '#1a1820',
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* ── Controls bar ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '8px 12px',
        background: '#14121a',
        borderBottom: '1px solid #1e1e2a',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Page navigation - host only */}
        {isHost && (
          <button
            onClick={handlePrev}
            disabled={currentPage <= 1}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #2a2a3a',
              background: currentPage <= 1 ? '#1a1a24' : '#1e1e2a',
              color: currentPage <= 1 ? '#444' : '#c4a8ff',
              cursor: currentPage <= 1 ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.15s',
            }}
          >
            ← Prev
          </button>
        )}

        {/* Page indicator */}
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#e8e4f0',
          padding: '4px 14px',
          borderRadius: 6,
          background: '#1a1428',
          border: '1px solid #3a2a5a',
        }}>
          Page {currentPage} of {effectiveTotalPages}
        </span>

        {isHost && (
          <button
            onClick={handleNext}
            disabled={currentPage >= effectiveTotalPages}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #2a2a3a',
              background: currentPage >= effectiveTotalPages ? '#1a1a24' : '#1e1e2a',
              color: currentPage >= effectiveTotalPages ? '#444' : '#c4a8ff',
              cursor: currentPage >= effectiveTotalPages ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 700,
              transition: 'all 0.15s',
            }}
          >
            Next →
          </button>
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#2a2a3a', margin: '0 4px' }} />

        {/* Zoom controls */}
        <button
          onClick={handleZoomOut}
          disabled={zoomIndex <= 0}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #2a2a3a',
            background: '#1e1e2a',
            color: zoomIndex <= 0 ? '#444' : '#aaa',
            cursor: zoomIndex <= 0 ? 'default' : 'pointer',
            fontSize: 14,
          }}
        >
          −
        </button>

        <span style={{ fontSize: 12, color: '#9b6dff', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>

        <button
          onClick={handleZoomIn}
          disabled={zoomIndex >= ZOOM_LEVELS.length - 1}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid #2a2a3a',
            background: '#1e1e2a',
            color: zoomIndex >= ZOOM_LEVELS.length - 1 ? '#444' : '#aaa',
            cursor: zoomIndex >= ZOOM_LEVELS.length - 1 ? 'default' : 'pointer',
            fontSize: 14,
          }}
        >
          +
        </button>

        {/* Document label */}
        <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>📄 PDF Presentation</span>
      </div>

      {/* ── PDF render area ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: 20,
      }}>
        {error ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
          }}>
            <span style={{ fontSize: 48 }}>⚠️</span>
            <span style={{ color: '#ff8080', fontSize: 14 }}>{error}</span>
          </div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: 40,
              }}>
                <div style={{
                  width: 36,
                  height: 36,
                  border: '3px solid #2a2a3a',
                  borderTopColor: '#9b6dff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ color: '#666', fontSize: 13 }}>Loading PDF…</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={pageWidth}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={
                <div style={{ padding: 40, color: '#666', fontSize: 13 }}>Rendering page…</div>
              }
            />
          </Document>
        )}
      </div>
    </div>
  )
}

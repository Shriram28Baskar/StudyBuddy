import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

function getTextFromChildren(children) {
  if (!children) return ''
  if (typeof children === 'string') return children
  if (Array.isArray(children)) {
    return children.map(getTextFromChildren).join('')
  }
  if (children.props && children.props.children) {
    return getTextFromChildren(children.props.children)
  }
  return ''
}

export default function MathMarkdown({ content, className = '' }) {
  return (
    <div className={`md-math-container ${className}`}>
      <style>{`
        .md-math-container {
          line-height: 1.8;
          font-size: 14px;
        }
        .md-math-container .katex-display {
          margin: 16px 0 !important;
          text-align: center;
        }
        .md-math-container .katex {
          font-size: 1.05em;
          color: inherit;
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => {
            const text = getTextFromChildren(children)
            const style = { margin: '0 0 8px 0' }

            // Step labels: e.g. "Step 1:", "In this case, we have:"
            const isStepLabel = /^(step\s*\d+|in\s+this\s+case|we\s+have|let\s+us|first,|second,|then,|finally,)/i.test(text.trim())
            if (isStepLabel) {
              style.fontWeight = '500'
              style.marginTop = '12px'
            }

            // Conclusion lines: e.g. "This implies that...", "Therefore,"
            const isConclusion = /^(this\s+implies|therefore|hence|thus|so,|consequently)/i.test(text.trim())
            if (isConclusion) {
              style.marginTop = '16px'
            }

            return <p style={style}>{children}</p>
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

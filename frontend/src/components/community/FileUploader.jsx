import { useRef } from 'react'

export default function FileUploader({ onSelectFile, disabled }) {
  const fileInputRef = useRef(null)

  const handleButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds the 10MB limit.')
      return
    }

    onSelectFile(file)
    e.target.value = ''
  }

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={disabled}
        accept=".pdf,.docx,.doc,.ppt,.pptx,.png,.jpg,.jpeg,.gif"
      />
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={disabled}
        style={{
          background: 'none', border: 'none', fontSize: 20, cursor: disabled ? 'not-allowed' : 'pointer',
          color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36,
          borderRadius: 8, transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1e1e2a' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        title="Attach File"
      >
        📎
      </button>
    </div>
  )
}

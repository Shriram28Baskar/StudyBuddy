import { useState, useEffect, useRef } from 'react'

export default function VoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => {
    startRecording()
    return () => {
      stopTimer()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        stream.getTracks().forEach((track) => track.stop())
        if (duration > 0.5) {
          onSend(audioBlob, duration)
        } else {
          onCancel()
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      startTimer()
    } catch (err) {
      console.error('Error accessing microphone:', err)
      onCancel()
    }
  }

  const startTimer = () => {
    setDuration(0)
    timerRef.current = setInterval(() => {
      setDuration((prev) => {
        if (prev >= 120) { // 2 minutes limit
          handleStop()
          return 120
        }
        return prev + 1
      })
    }, 1000)
  }

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleStop = () => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }

  const handleCancel = () => {
    stopTimer()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    onCancel()
  }

  const formatTime = (time) => {
    const mins = Math.floor(time / 60)
    const secs = time % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#1a1428', border: '1px solid #3d2060', borderRadius: 10, flex: 1 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4d4d', animation: 'sb-pulse 1s infinite' }} />
      <style>{`
        @keyframes sb-pulse {
          0% { opacity: 0.3; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
        }
      `}</style>
      <span style={{ fontSize: 13, color: '#e8e4f0', fontWeight: 600, fontFamily: 'monospace' }}>Recording: {formatTime(duration)}</span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button
          onClick={handleCancel}
          style={{ background: 'none', border: 'none', color: '#ff8080', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          Cancel
        </button>
        <button
          onClick={handleStop}
          style={{ background: '#5c35aa', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}

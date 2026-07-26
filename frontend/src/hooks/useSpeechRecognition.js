import { useState, useRef, useCallback } from 'react'

export function useSpeechRecognition(language = 'en-IN') {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)

  const supported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const startListening = useCallback(() => {
    if (!supported) {
      setError('Speech recognition not supported in this browser.')
      return
    }
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = language

    recognition.onresult = (e) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('')
      setTranscript(t)
    }
    recognition.onerror = (e) => setError(e.error)
    recognition.onend = () => setIsListening(false)

    recognition.start()
    recognitionRef.current = recognition
    setIsListening(true)
    setError(null)
  }, [supported, language])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  return {
    transcript,
    setTranscript,
    isListening,
    startListening,
    stopListening,
    error,
    supported,
  }
}

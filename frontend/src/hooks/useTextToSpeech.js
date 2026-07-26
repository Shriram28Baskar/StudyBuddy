import { useState, useCallback } from 'react'

export function useTextToSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window

  const speak = useCallback(
    (text, langCode = 'en-IN') => {
      if (!supported) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = langCode
      utterance.rate = 0.9
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [supported]
  )

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [])

  return { speak, stop, isSpeaking, supported }
}

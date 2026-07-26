import { useState, useEffect, useCallback, useRef } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firestore'
import { clansAPI } from '@/services/api'
import useAppStore from '@/store/useAppStore'

export default function useClanChat(clanId) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const user = useAppStore((state) => state.auth.user)
  const pollIntervalRef = useRef(null)

  const fetchMessages = useCallback(async (showSilence = false) => {
    if (!clanId) return
    try {
      const res = await clansAPI.getMessages(clanId)
      setMessages(res.data)
    } catch (err) {
      console.error("Failed to fetch clan messages:", err)
    } finally {
      if (showSilence) setLoading(false)
    }
  }, [clanId])

  useEffect(() => {
    if (!clanId) return

    setLoading(true)
    fetchMessages(true)

    // Setup polling every 3 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchMessages(false)
    }, 3000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [clanId, fetchMessages])

  const sendMessage = useCallback(async (content, type = 'text', fileData = null) => {
    if (!clanId || !user) return
    const msg = {
      type,
      content,
      ...fileData,
    }
    try {
      const res = await clansAPI.sendMessage(clanId, msg)
      setMessages((prev) => [...prev, res.data])
    } catch (err) {
      console.error("Failed to send message:", err)
    }
  }, [clanId, user])

  const sendFile = useCallback(async (file) => {
    if (!clanId || !file) return
    const fileRef = ref(storage, `clans/${clanId}/files/${Date.now()}_${file.name}`)
    const snapshot = await uploadBytes(fileRef, file)
    const url = await getDownloadURL(snapshot.ref)

    await sendMessage(file.name, 'file', {
      fileUrl: url,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type.includes('image') ? 'image' : 'document',
    })
  }, [clanId, sendMessage])

  const sendVoice = useCallback(async (blob, duration) => {
    if (!clanId || !blob) return
    const voiceRef = ref(storage, `clans/${clanId}/voice/${Date.now()}.wav`)
    const snapshot = await uploadBytes(voiceRef, blob)
    const url = await getDownloadURL(snapshot.ref)

    await sendMessage('Voice Message', 'voice', {
      fileUrl: url,
      fileName: 'voice.wav',
      fileType: 'audio',
      duration,
    })
  }, [clanId, sendMessage])

  return {
    messages,
    loading,
    sendMessage,
    sendFile,
    sendVoice,
  }
}

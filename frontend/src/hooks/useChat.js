import { useState, useCallback, useRef } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export function useChat({
  subject  = 'General',
  topic    = '',
  level    = 'beginner',
  userId   = null,
} = {}) {
  const [messages, setMessages] = useState([
    {
      role:      'assistant',
      content:   `Hi! I'm your AI tutor. I'm ready to help with **${subject}**${topic ? ` — specifically **${topic}**` : ''}.\n\nWhat would you like to know?`,
      timestamp: new Date(),
    },
  ])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [sessionId, setSessionId] = useState(null)

  const abortRef = useRef(null)

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return

    const userMessage = {
      role:      'user',
      content:   text.trim(),
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setError(null)

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    try {
      // Build history from all messages except the greeting
      const history = messages
        .slice(1)
        .map(m => ({
          role:    m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        }))

      // Add the current user message
      history.push({ role: 'user', content: text.trim() })

      const payload = {
        subject,
        topic:    topic ?? '',
        level:    level ?? 'beginner',
        messages: history,
      }

      // Only add user_id if it exists
      if (userId) payload.user_id = userId

      const response = await axios.post(
        `${API_BASE}/chat/history`,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          signal:  abortRef.current.signal,
        }
      )

      const aiMessage = {
        role:      'assistant',
        content:   response.data.answer,
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, aiMessage])

      if (response.data.session_id) {
        setSessionId(response.data.session_id)
      }

    } catch (err) {
      if (axios.isCancel(err)) return

      const message = err.response?.data?.detail
        ?? 'Could not reach the AI service. Check your API key and backend connection.'

      setError(message)
      setMessages(prev => [
        ...prev,
        {
          role:      'assistant',
          content:   `⚠️ ${message}`,
          timestamp: new Date(),
          isError:   true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, subject, topic, level, userId])

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setMessages([
      {
        role:      'assistant',
        content:   `Conversation cleared. What would you like to explore in **${subject}**?`,
        timestamp: new Date(),
      },
    ])
    setError(null)
    setSessionId(null)
  }, [subject])

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return
    setMessages(prev => prev.filter(m => !m.isError))
    sendMessage(lastUser.content)
  }, [messages, sendMessage])

  const loadHistory = useCallback(async (uid) => {
    if (!uid) return
    try {
      const res    = await axios.get(`${API_BASE}/chat/history/${uid}`)
      const convos = res.data.conversations ?? []
      if (convos.length === 0) return

      const latest   = convos[0]
      const restored = (latest.messages ?? []).map(m => ({
        role:      m.role,
        content:   m.content,
        timestamp: new Date(latest.timestamp),
      }))

      if (restored.length > 0) {
        setMessages(restored)
        setSessionId(latest.id)
      }
    } catch {
      // Non-critical — silently ignore
    }
  }, [])

  return {
    messages,
    loading,
    error,
    sessionId,
    messageCount: messages.length,
    hasMessages:  messages.length > 1,
    sendMessage,
    clearMessages,
    retryLast,
    loadHistory,
    setError,
  }
}
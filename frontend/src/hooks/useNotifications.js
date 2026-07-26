import { useState, useEffect, useCallback, useRef } from 'react'
import { notificationsAPI } from '@/services/api'
import useAppStore from '@/store/useAppStore'

export default function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const user = useAppStore((state) => state.auth.user)
  const pollIntervalRef = useRef(null)

  const fetchNotifications = useCallback(async (showSilence = false) => {
    if (!user?.uid) return
    try {
      const res = await notificationsAPI.getAll()
      setNotifications(res.data)
    } catch (err) {
      console.error("Failed to fetch notifications:", err)
    } finally {
      if (showSilence) setLoading(false)
    }
  }, [user?.uid])

  useEffect(() => {
    if (!user?.uid) return

    setLoading(true)
    fetchNotifications(true)

    // Poll every 5 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchNotifications(false)
    }, 5000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [user?.uid, fetchNotifications])

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const markAllAsRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err)
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  }
}

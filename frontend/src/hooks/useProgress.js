import { useState, useEffect, useCallback, useMemo } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

// ── Hook ──────────────────────────────────────────────────────────────
export function useProgress(userId = null) {
  const [entries,      setEntries]      = useState([])
  const [subjectStats, setSubjectStats] = useState([])
  const [analysis,     setAnalysis]     = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState(null)

  // ── Fetch progress on mount / userId change ────────────────────────
  useEffect(() => {
    if (userId) fetchProgress()
  }, [userId])

  // ── Fetch all progress entries ─────────────────────────────────────
  const fetchProgress = useCallback(async (subject = null) => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const url    = `${API_BASE}/progress/${userId}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`
      const res    = await axios.get(url)
      setEntries(res.data.entries      ?? [])
      setSubjectStats(res.data.subject_stats ?? [])
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load progress data.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  // ── Log a new score ────────────────────────────────────────────────
  const logScore = useCallback(async ({ subject, score, testName = '' }) => {
    if (!userId) {
      setError('You must be signed in to log scores.')
      return { success: false }
    }
    if (score < 0 || score > 100) {
      setError('Score must be between 0 and 100.')
      return { success: false }
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/progress`, {
        user_id:   userId,
        subject,
        score:     Number(score),
        test_name: testName,
      })

      // Optimistically add the new entry to local state
      const newEntry = {
        id:        res.data.entry_id,
        subject,
        score:     Number(score),
        testName,
        timestamp: new Date().toISOString(),
        trend:     res.data.trend,
      }
      setEntries(prev => [...prev, newEntry])

      // Refresh stats after logging
      await fetchProgress()

      return { success: true, trend: res.data.trend, entryId: res.data.entry_id }
    } catch (err) {
      const message = err.response?.data?.detail ?? 'Failed to log score.'
      setError(message)
      return { success: false, error: message }
    } finally {
      setSubmitting(false)
    }
  }, [userId, fetchProgress])

  // ── Fetch AI-generated performance analysis ────────────────────────
  const fetchAnalysis = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const res = await axios.post(`${API_BASE}/progress/${userId}/analysis`)
      setAnalysis(res.data.analysis)
      return res.data.analysis
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to generate analysis.')
      return null
    } finally {
      setLoading(false)
    }
  }, [userId])

  // ── Computed stats (derived from entries, no extra API call) ────────
  const computed = useMemo(() => {
    if (entries.length === 0) return null

    const allScores  = entries.map(e => Number(e.score))
    const overall    = round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    const highest    = Math.max(...allScores)
    const lowest     = Math.min(...allScores)
    const totalTests = entries.length

    // Group by subject
    const bySubject = {}
    for (const e of entries) {
      const subj = e.subject ?? 'Unknown'
      if (!bySubject[subj]) bySubject[subj] = []
      bySubject[subj].push(Number(e.score))
    }

    // Identify weak areas (avg < 60) and strong areas (avg >= 80)
    const weakAreas   = []
    const strongAreas = []

    for (const [subj, scores] of Object.entries(bySubject)) {
      const avg = round(scores.reduce((a, b) => a + b, 0) / scores.length)
      if (avg < 60)  weakAreas.push({ subject: subj, avg })
      if (avg >= 80) strongAreas.push({ subject: subj, avg })
    }

    // Score trend over the last 5 entries
    const recentScores = allScores.slice(-5)
    const scoreTrend   = recentScores.length >= 2
      ? round(recentScores[recentScores.length - 1] - recentScores[0])
      : 0

    // Study streak: count consecutive days with at least one entry
    const streak = computeStreak(entries)

    return {
      overall,
      highest,
      lowest,
      totalTests,
      weakAreas:   weakAreas.sort((a, b) => a.avg - b.avg),
      strongAreas: strongAreas.sort((a, b) => b.avg - a.avg),
      scoreTrend,
      streak,
    }
  }, [entries])

  // ── Filter entries by subject ──────────────────────────────────────
  const getEntriesForSubject = useCallback((subject) => {
    return entries
      .filter(e => e.subject === subject)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  }, [entries])

  // ── Get score history as chart-friendly format ─────────────────────
  const getChartData = useCallback((subject = null) => {
    const filtered = subject
      ? entries.filter(e => e.subject === subject)
      : entries
    return filtered
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((e, i) => ({
        index:     i + 1,
        score:     Number(e.score),
        subject:   e.subject,
        testName:  e.testName ?? e.test_name ?? '',
        date:      formatDate(e.timestamp),
      }))
  }, [entries])

  return {
    // State
    entries,
    subjectStats,
    analysis,
    loading,
    submitting,
    error,

    // Derived
    computed,
    subjects: [...new Set(entries.map(e => e.subject))],
    isEmpty:  entries.length === 0,

    // Actions
    logScore,
    fetchProgress,
    fetchAnalysis,
    getEntriesForSubject,
    getChartData,
    clearError: () => setError(null),
  }
}

// ── Utilities ─────────────────────────────────────────────────────────

function round(n, decimals = 1) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals
}

function formatDate(timestamp) {
  try {
    return new Date(timestamp).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short',
    })
  } catch {
    return ''
  }
}

function computeStreak(entries) {
  if (entries.length === 0) return 0

  // Get unique dates with entries, sorted descending
  const dates = [...new Set(
    entries.map(e => new Date(e.timestamp).toDateString())
  )]
    .map(d => new Date(d))
    .sort((a, b) => b - a)

  let streak = 0
  let cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  for (const date of dates) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const diff = Math.round((cursor - d) / (1000 * 60 * 60 * 24))
    if (diff <= 1) {
      streak++
      cursor = d
    } else {
      break
    }
  }

  return streak
}
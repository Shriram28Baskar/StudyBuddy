import axios from 'axios'
import { getAuth } from 'firebase/auth'

// ── Base client ───────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 120000,   // 120s — generous for LLM endpoints and rate limit retries
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach Firebase ID token ────────────────────
api.interceptors.request.use(
  async (config) => {
    try {
      const auth  = getAuth()
      const user  = auth.currentUser
      if (user) {
        const token = await user.getIdToken()
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      // Token fetch failed — proceed without auth header (dev mode)
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ── Response interceptor — normalise errors ───────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)

    const status  = error.response?.status
    const detail  = error.response?.data?.detail

    // Build a clean error object
    const err     = new Error(detail ?? error.message ?? 'An unexpected error occurred.')
    err.status    = status
    err.raw       = error

    // Surface auth errors clearly
    if (status === 401) err.message = 'Session expired. Please sign in again.'
    if (status === 429) err.message = 'Too many requests. Please slow down.'
    if (status === 503) err.message = 'AI service unavailable.'

    return Promise.reject(err)
  }
)

export default api

// ─────────────────────────────────────────────────────────────────────
// Typed API methods — one section per backend router
// ─────────────────────────────────────────────────────────────────────

// ── Chat ──────────────────────────────────────────────────────────────
export const chatAPI = {
  /**
   * Single-turn doubt solver.
   * POST /chat
   */
  ask: ({ question, subject = 'General', topic = '', level = 'beginner', userId = null }) =>
    api.post('/chat', { question, subject, topic, level, user_id: userId }),

  /**
   * Multi-turn chat with full history.
   * POST /chat/history
   */
  askWithHistory: ({ messages, subject, topic, level, userId }) =>
    api.post('/chat/history', {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      subject,
      topic,
      level,
      user_id: userId,
    }),

  /**
   * Fetch stored conversation history for a user.
   * GET /chat/history/:userId
   */
  getHistory: (userId, limit = 20) =>
    api.get(`/chat/history/${userId}`, { params: { limit } }),
}

// ── Documents (RAG) ───────────────────────────────────────────────────
export const documentsAPI = {
  /**
   * Upload a document for RAG ingestion.
   * POST /documents/upload
   * Sends as multipart/form-data.
   */
  upload: (file, onUploadProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/documents/upload', form, {
      headers:          { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress(Math.round((e.loaded * 100) / e.total))
        : undefined,
      timeout: 300000,   // uploads can be slow
    })
  },

  /**
   * Query a document collection using RAG.
   * POST /documents/query
   */
  query: ({ question, collection, topK = 5 }) =>
    api.post('/documents/query', { question, collection, top_k: topK }),

  /**
   * Delete a document and its embeddings.
   * DELETE /documents/:docId
   */
  delete: (docId) =>
    api.delete(`/documents/${docId}`),

  /**
   * Fetch extracted topics for a document.
   * GET /documents/:docId/topics
   */
  getTopics: (docId, filename) =>
    api.get(`/documents/${docId}/topics`, { params: { filename } }),
}

// ── Users ─────────────────────────────────────────────────────────────
export const usersAPI = {
  getProfile:         ()            => api.get('/users/profile'),
  searchByRegisterId: (id)          => api.get('/users/search', { params: { register_id: id } }),
  updateProfile:      (data)        => api.put('/users/profile', data),
}

// ── Friends ───────────────────────────────────────────────────────────
export const friendsAPI = {
  sendRequest:        (registerId)  => api.post('/friends/request', { registerId }),
  getReceivedRequests:()            => api.get('/friends/requests/received'),
  getSentRequests:    ()            => api.get('/friends/requests/sent'),
  acceptRequest:      (id)          => api.post(`/friends/requests/${id}/accept`),
  rejectRequest:      (id)          => api.post(`/friends/requests/${id}/reject`),
  getFriends:         ()            => api.get('/friends/list'),
  removeFriend:       (id)          => api.delete(`/friends/${id}`),
}

// ── Clans ─────────────────────────────────────────────────────────────
export const clansAPI = {
  create:             (data)        => api.post('/clans', data),
  search:             (q)           => api.get('/clans/search', { params: { q } }),
  getMy:              ()            => api.get('/clans/my'),
  get:                (id)          => api.get(`/clans/${id}`),
  update:             (id, data)    => api.put(`/clans/${id}`, data),
  delete:             (id)          => api.delete(`/clans/${id}`),
  join:               (id)          => api.post(`/clans/${id}/join`),
  getMembers:         (id)          => api.get(`/clans/${id}/members`),
  removeMember:       (id, uid)     => api.delete(`/clans/${id}/members/${uid}`),
  updateRole:         (id, uid, role) => api.put(`/clans/${id}/members/${uid}/role`, { role }),
  leave:              (id)          => api.post(`/clans/${id}/leave`),
  transfer:           (id, uid)     => api.post(`/clans/${id}/transfer`, { newLeaderUid: uid }),
  getJoinRequests:    (id)          => api.get(`/clans/${id}/join-requests`),
  acceptJoinRequest:  (clanId, reqId) => api.post(`/clans/${clanId}/join-requests/${reqId}/accept`),
  rejectJoinRequest:  (clanId, reqId) => api.post(`/clans/${clanId}/join-requests/${reqId}/reject`),
  getMessages:        (id)          => api.get(`/clans/${id}/messages`),
  sendMessage:        (id, data)    => api.post(`/clans/${id}/messages`, data),
}

// ── Notifications ─────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll:     ()   => api.get('/notifications'),
  markRead:   (id) => api.put(`/notifications/${id}/read`),
  markAllRead:()   => api.put('/notifications/read-all'),
}

// ── Progress ──────────────────────────────────────────────────────────
export const progressAPI = {
  /**
   * Log a test score.
   * POST /progress
   */
  logScore: ({ userId, subject, score, testName = '' }) =>
    api.post('/progress', {
      user_id:   userId,
      subject,
      score,
      test_name: testName,
    }),

  /**
   * Fetch progress history for a user.
   * GET /progress/:userId
   */
  getProgress: (userId, subject = null) =>
    api.get(`/progress/${userId}`, {
      params: subject ? { subject } : {},
    }),

  /**
   * Get AI-generated performance analysis.
   * POST /progress/:userId/analysis
   */
  getAnalysis: (userId) =>
    api.post(`/progress/${userId}/analysis`),
}

// ── Health ────────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => api.get('/health'),
}

// ── Study Plan AI (multi-week adaptive plans) ─────────────────────────
// Covers the /generate-study-plan prefix used by StudyPlanAI.jsx,
// StudyPlanHistory.jsx, ProgressDashboard.jsx, and ScorePredictor.jsx.
export const studyPlanAIAPI = {
  /**
   * Generate a new multi-week AI study plan.
   * POST /generate-study-plan
   */
  generate: ({ topic, durationWeeks, userId = null }) =>
    api.post('/generate-study-plan', {
      topic,
      duration_weeks: durationWeeks,
      user_id:        userId,
    }, { timeout: 120000 }),  // multi-step LLM pipeline — needs extra time

  /**
   * List all plans for a user.
   * GET /generate-study-plan?user_id=...
   */
  list: (userId) =>
    api.get('/generate-study-plan', { params: { user_id: userId } }),

  /**
   * Get a single plan by ID.
   * GET /generate-study-plan/:planId
   */
  get: (planId) =>
    api.get(`/generate-study-plan/${planId}`),

  /**
   * Delete a plan.
   * DELETE /generate-study-plan/:planId
   */
  delete: (planId) =>
    api.delete(`/generate-study-plan/${planId}`),

  /**
   * Update task completion and test scores for a plan (merge, not overwrite).
   * PATCH /generate-study-plan/:planId/progress
   */
  updateProgress: (planId, { completedTasks, testScores, completionPct }) =>
    api.patch(`/generate-study-plan/${planId}/progress`, {
      plan_id:         planId,
      completed_tasks: completedTasks,
      test_scores:     testScores,
      completion_percentage: completionPct,
    }),

  /**
   * Trigger AI adaptation of a plan based on performance.
   * POST /generate-study-plan/:planId/adapt
   */
  adapt: (planId) =>
    api.post(`/generate-study-plan/${planId}/adapt`),
}

// ── Burnout Detector ──────────────────────────────────────────────────
export const burnoutAPI = {
  /**
   * Fetch the most recent burnout report for a user.
   * GET /burnout/report/:userId
   */
  getReport: (userId) =>
    api.get(`/burnout/report/${userId}`),

  /**
   * Trigger a fresh burnout analysis across all study plans.
   * POST /burnout/analyze
   */
  analyze: (userId) =>
    api.post('/burnout/analyze', { user_id: userId }),
}

// ── Gap Analysis ──────────────────────────────────────────────────────
export const gapAnalysisAPI = {
  /**
   * Analyze PYQ files against a syllabus to identify high-priority topics.
   * POST /gap-analysis/analyze (multipart/form-data)
   */
  analyze: ({ pyqFiles, syllabusFile, subject, yearsCovered }) => {
    const form = new FormData()
    pyqFiles.forEach((f) => form.append('pyq_files', f))
    form.append('syllabus_file', syllabusFile)
    form.append('subject', subject.trim())
    form.append('years_covered', String(yearsCovered))
    return api.post('/gap-analysis/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },
}

// ── PYQs Analyzer ─────────────────────────────────────────────────────
export const pyqsAPI = {
  /**
   * Analyze previous year question PDFs to extract important questions and generate a model paper.
   * POST /pyqs/analyze (multipart/form-data)
   */
  analyze: ({ mode, files }) => {
    const form = new FormData()
    form.append('mode', mode)
    files.forEach((f) => form.append('files', f))
    return api.post('/pyqs/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    })
  },
}

// ── Photo Solver ──────────────────────────────────────────────────────
export const photoSolverAPI = {
  /**
   * Upload an image of a question and get a step-by-step AI solution.
   * POST /photo-solver/solve (multipart/form-data)
   */
  solve: ({ imageFile, subject = '' }) => {
    const form = new FormData()
    form.append('image', imageFile)
    form.append('subject', subject)
    return api.post('/photo-solver/solve', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },
}

// ── Voice Solver ──────────────────────────────────────────────────────
export const voiceSolverAPI = {
  /**
   * Solve a spoken or typed question. Response is TTS-optimized.
   * POST /voice-solver/solve-text
   */
  solve: ({ transcript, language, subject }) =>
    api.post('/voice-solver/solve-text', { transcript, language, subject }),
}

// ── Score Predictor ───────────────────────────────────────────────────
export const scorePredictorAPI = {
  /**
   * Predict exam score based on plan progress and exam date.
   * POST /score-predictor/predict
   */
  predict: ({ planId, examDate, userId }) =>
    api.post('/score-predictor/predict', {
      plan_id:   planId,
      exam_date: examDate,
      user_id:   userId,
    }),
}

// ── Study Rooms ───────────────────────────────────────────────────────
export const studyRoomsAPI = {
  /**
   * Create a new collaborative study room.
   * POST /study-rooms/create
   */
  create: ({ roomName, subject, hostName, maxParticipants }) =>
    api.post('/study-rooms/create', {
      room_name:        roomName.trim(),
      subject:          subject.trim(),
      host_name:        hostName.trim(),
      max_participants: maxParticipants,
    }),

  /**
   * Join a study room via 6-character join code.
   * POST /study-rooms/join/:joinCode
   */
  join: (joinCode, userName) =>
    api.post(`/study-rooms/join/${joinCode.trim().toUpperCase()}`, {
      user_name: userName.trim(),
    }),

  /**
   * Upload a PDF document to a study room (host only).
   * POST /study-rooms/:roomId/upload-document?user_id=...
   */
  uploadDocument: (roomId, userId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/study-rooms/${roomId}/upload-document`, form, {
      params:  { user_id: userId },
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },
}

// ── Quiz Battle ───────────────────────────────────────────────────────
export const quizBattleAPI = {
  /**
   * Generate quiz questions from an uploaded document.
   * POST /quiz-battle/generate-from-doc (multipart/form-data)
   */
  generateFromDoc: (file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/quiz-battle/generate-from-doc', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
  },

  /**
   * Create a new quiz battle room.
   * POST /quiz-battle/create
   */
  create: ({ subject, difficulty, playerName, docQuestions = null }) => {
    const body = { subject, difficulty, player_name: playerName }
    if (docQuestions && docQuestions.length > 0) body.doc_questions = docQuestions
    return api.post('/quiz-battle/create', body)
  },

  /**
   * Join an existing quiz battle room by code.
   * POST /quiz-battle/join/:roomCode
   */
  join: (roomCode, playerName) =>
    api.post(`/quiz-battle/join/${roomCode.trim().toUpperCase()}`, {
      player_name: playerName,
    }),
}
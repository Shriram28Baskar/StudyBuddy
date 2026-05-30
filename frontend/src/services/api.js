import axios from 'axios'
import { getAuth } from 'firebase/auth'

// ── Base client ───────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 30000,   // 30s — generous for LLM endpoints
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
    if (status === 503) err.message = 'AI service unavailable. Check your Groq API key.'

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
      timeout: 60000,   // uploads can be slow
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
}

// ── Study Plan ────────────────────────────────────────────────────────
export const studyPlanAPI = {
  /**
   * Generate a day-wise study plan.
   * POST /studyplan
   */
  generate: ({ exam, subjects, examDate, hoursPerDay, userId = null }) =>
    api.post('/studyplan', {
      exam,
      subjects,
      exam_date:     examDate instanceof Date
        ? examDate.toISOString().split('T')[0]
        : examDate,
      hours_per_day: hoursPerDay,
      user_id:       userId,
    }),
}

// ── Mind Map ──────────────────────────────────────────────────────────
export const mindMapAPI = {
  /**
   * Generate a mind map for a topic.
   * POST /mindmap
   */
  generate: ({ topic, depth = 2 }) =>
    api.post('/mindmap', { topic, depth }),
}

// ── Roadmap ───────────────────────────────────────────────────────────
export const roadmapAPI = {
  /**
   * Generate a phased learning roadmap.
   * POST /roadmap
   */
  generate: ({ goal }) =>
    api.post('/roadmap', { goal }),
}

// ── Career ────────────────────────────────────────────────────────────
export const careerAPI = {
  /**
   * Get career role matches based on skills and interests.
   * POST /career
   */
  getGuidance: ({ skills, interests = [] }) =>
    api.post('/career', { skills, interests }),
}

// ── Community ─────────────────────────────────────────────────────────
export const communityAPI = {
  /**
   * Fetch recent community posts.
   * GET /community/posts
   */
  getPosts: (limit = 30) =>
    api.get('/community/posts', { params: { limit } }),

  /**
   * Create a new post.
   * POST /community/post
   */
  createPost: ({ userId, title, body, tag = 'Discussion' }) =>
    api.post('/community/post', { user_id: userId, title, body, tag }),

  /**
   * Like a post.
   * POST /community/post/:postId/like
   */
  likePost: (postId) =>
    api.post(`/community/post/${postId}/like`),

  /**
   * Add a comment to a post.
   * POST /community/post/:postId/comment
   */
  addComment: (postId, { userId, text }) =>
    api.post(`/community/post/${postId}/comment`, { post_id: postId, user_id: userId, text }),

  /**
   * Get comments for a post.
   * GET /community/post/:postId/comments
   */
  getComments: (postId) =>
    api.get(`/community/post/${postId}/comments`),
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
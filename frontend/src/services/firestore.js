import { getApps, getApp, initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore'

// ── Firestore instance (reuses the app initialised in auth.js) ────────
const app = getApps().length === 0
  ? initializeApp({
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    })
  : getApp()

const db = getFirestore(app)
export { db }

// ── Utility: convert Firestore doc → plain JS object ─────────────────
function docToObj(docSnap) {
  if (!docSnap.exists()) return null
  const data = docSnap.data()
  // Convert Firestore Timestamps to JS Dates
  const converted = {}
  for (const [k, v] of Object.entries(data)) {
    converted[k] = v instanceof Timestamp ? v.toDate() : v
  }
  return { id: docSnap.id, ...converted }
}

function docsToArr(querySnap) {
  return querySnap.docs.map(docToObj)
}

// ─────────────────────────────────────────────────────────────────────
// Collections
// ─────────────────────────────────────────────────────────────────────

// ── User profiles ─────────────────────────────────────────────────────
export const userProfilesDB = {
  /**
   * Create or overwrite a user profile document.
   * Called after registration or Google sign-in.
   */
  upsert: async (userId, { displayName, email, photoURL = null }) => {
    const ref  = doc(db, 'users', userId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName,
        email,
        photoURL,
        plan:      'free',
        createdAt: serverTimestamp(),
      })
    } else {
      await updateDoc(ref, { displayName, email, photoURL })
    }
  },

  get: async (userId) => {
    const snap = await getDoc(doc(db, 'users', userId))
    return docToObj(snap)
  },

  update: async (userId, data) => {
    await updateDoc(doc(db, 'users', userId), data)
  },
}

// ── Conversation history ──────────────────────────────────────────────
export const conversationsDB = {
  /**
   * Save a completed conversation.
   */
  save: async (userId, { messages, subject, topic }) => {
    const ref = await addDoc(collection(db, 'conversations'), {
      userId,
      messages,
      subject,
      topic,
      timestamp: serverTimestamp(),
    })
    return ref.id
  },

  /**
   * Fetch the most recent conversations for a user.
   */
  getRecent: async (userId, count = 10) => {
    const q    = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(count),
    )
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  /**
   * Real-time listener for a user's conversations.
   * Returns the unsubscribe function.
   */
  subscribe: (userId, callback) => {
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(20),
    )
    return onSnapshot(q, (snap) => callback(docsToArr(snap)))
  },
}

// ── Study plans ───────────────────────────────────────────────────────
export const studyPlansDB = {
  save: async (userId, planData) => {
    const ref = await addDoc(collection(db, 'studyPlans'), {
      userId,
      ...planData,
      createdAt: serverTimestamp(),
    })
    return ref.id
  },

  getAll: async (userId) => {
    const q    = query(
      collection(db, 'studyPlans'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    )
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  delete: async (planId) => {
    await deleteDoc(doc(db, 'studyPlans', planId))
  },

  // ── Added from firestore_patch.js ─────────────────────────────────
  saveScore: async (planId, weekIndex, scoreData) => {
    await updateDoc(doc(db, 'studyPlans', planId), {
      [`scores.week_${weekIndex}`]: scoreData,
    })
  },

  saveProgress: async (planId, taskKey, isDone) => {
    await updateDoc(doc(db, 'studyPlans', planId), {
      [`progress.${taskKey}`]: isDone,
    })
  },
  // ─────────────────────────────────────────────────────────────────
}

// ── Community posts ───────────────────────────────────────────────────
export const postsDB = {
  /**
   * Create a new community post.
   */
  create: async ({ userId, title, body, tag = 'Discussion' }) => {
    const ref = await addDoc(collection(db, 'posts'), {
      userId,
      title,
      body,
      tag,
      likes:        0,
      commentCount: 0,
      timestamp:    serverTimestamp(),
    })
    return ref.id
  },

  /**
   * Fetch the most recent posts.
   */
  getRecent: async (count = 30) => {
    const q    = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc'),
      limit(count),
    )
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  /**
   * Real-time listener for the community feed.
   */
  subscribe: (callback, count = 30) => {
    const q = query(
      collection(db, 'posts'),
      orderBy('timestamp', 'desc'),
      limit(count),
    )
    return onSnapshot(q, (snap) => callback(docsToArr(snap)))
  },

  /**
   * Increment the like count on a post.
   */
  like: async (postId) => {
    await updateDoc(doc(db, 'posts', postId), { likes: increment(1) })
  },

  /**
   * Add a comment and increment the comment count.
   */
  addComment: async (postId, { userId, text }) => {
    const commentRef = await addDoc(
      collection(db, 'posts', postId, 'comments'),
      { userId, text, timestamp: serverTimestamp() }
    )
    await updateDoc(doc(db, 'posts', postId), { commentCount: increment(1) })
    return commentRef.id
  },

  /**
   * Fetch comments for a post.
   */
  getComments: async (postId) => {
    const q    = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('timestamp', 'asc'),
    )
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  /**
   * Real-time listener for a post's comments.
   */
  subscribeComments: (postId, callback) => {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('timestamp', 'asc'),
    )
    return onSnapshot(q, (snap) => callback(docsToArr(snap)))
  },

  delete: async (postId) => {
    await deleteDoc(doc(db, 'posts', postId))
  },
}

// ── Progress entries ──────────────────────────────────────────────────
export const progressDB = {
  /**
   * Log a new test score.
   */
  add: async ({ userId, subject, score, testName = '' }) => {
    const ref = await addDoc(collection(db, 'progress'), {
      userId,
      subject,
      score,
      testName,
      timestamp: serverTimestamp(),
    })
    return ref.id
  },

  /**
   * Fetch all progress entries for a user, optionally filtered by subject.
   */
  getAll: async (userId, subject = null) => {
    const constraints = [
      where('userId', '==', userId),
      orderBy('timestamp', 'asc'),
    ]
    if (subject) constraints.splice(1, 0, where('subject', '==', subject))
    const q    = query(collection(db, 'progress'), ...constraints)
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  /**
   * Real-time listener for a user's progress.
   */
  subscribe: (userId, callback) => {
    const q = query(
      collection(db, 'progress'),
      where('userId', '==', userId),
      orderBy('timestamp', 'asc'),
    )
    return onSnapshot(q, (snap) => callback(docsToArr(snap)))
  },

  delete: async (entryId) => {
    await deleteDoc(doc(db, 'progress', entryId))
  },
}

// ── Saved roadmaps ────────────────────────────────────────────────────
export const roadmapsDB = {
  save: async (userId, { goal, phases }) => {
    const ref = await addDoc(collection(db, 'roadmaps'), {
      userId,
      goal,
      phases,
      createdAt: serverTimestamp(),
    })
    return ref.id
  },

  getAll: async (userId) => {
    const q    = query(
      collection(db, 'roadmaps'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    )
    const snap = await getDocs(q)
    return docsToArr(snap)
  },

  delete: async (roadmapId) => {
    await deleteDoc(doc(db, 'roadmaps', roadmapId))
  },
}
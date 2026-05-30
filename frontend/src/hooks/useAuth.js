import { useState, useEffect, useCallback } from 'react'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import { initializeApp, getApps } from 'firebase/app'

// ── Firebase init (idempotent) ────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()

// ── Hook ──────────────────────────────────────────────────────────────
export function useAuth() {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)   // true until first auth check resolves
  const [error,   setError]   = useState(null)

  // Listen for Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe   // cleanup on unmount
  }, [])

  const clearError = useCallback(() => setError(null), [])

  // ── Sign in with email + password ─────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    setError(null)
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      return { user: credential.user, error: null }
    } catch (err) {
      const message = friendlyError(err.code)
      setError(message)
      return { user: null, error: message }
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Register with email + password ────────────────────────────────
  const signUp = useCallback(async (email, password, displayName = '') => {
    setError(null)
    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      // Set display name immediately after account creation
      if (displayName) {
        await updateProfile(credential.user, { displayName })
      }
      return { user: credential.user, error: null }
    } catch (err) {
      const message = friendlyError(err.code)
      setError(message)
      return { user: null, error: message }
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Sign in with Google popup ─────────────────────────────────────
  const signInWithGoogle = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const credential = await signInWithPopup(auth, googleProvider)
      return { user: credential.user, error: null }
    } catch (err) {
      // User closed the popup — not a real error worth showing
      if (err.code === 'auth/popup-closed-by-user') {
        setLoading(false)
        return { user: null, error: null }
      }
      const message = friendlyError(err.code)
      setError(message)
      return { user: null, error: message }
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Sign out ──────────────────────────────────────────────────────
  const logOut = useCallback(async () => {
    setError(null)
    try {
      await signOut(auth)
      return { error: null }
    } catch (err) {
      const message = friendlyError(err.code)
      setError(message)
      return { error: message }
    }
  }, [])

  // ── Password reset email ──────────────────────────────────────────
  const resetPassword = useCallback(async (email) => {
    setError(null)
    try {
      await sendPasswordResetEmail(auth, email)
      return { error: null }
    } catch (err) {
      const message = friendlyError(err.code)
      setError(message)
      return { error: message }
    }
  }, [])

  // ── Get current ID token (to send to FastAPI backend) ─────────────
  const getIdToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null
    try {
      return await auth.currentUser.getIdToken(forceRefresh)
    } catch {
      return null
    }
  }, [])

  return {
    // State
    user,
    loading,
    error,
    isAuthenticated: !!user,

    // Derived user info (safe to access even if user is null)
    userId:      user?.uid        ?? null,
    email:       user?.email      ?? null,
    displayName: user?.displayName ?? 'Student',
    photoURL:    user?.photoURL   ?? null,

    // Actions
    signIn,
    signUp,
    signInWithGoogle,
    logOut,
    resetPassword,
    getIdToken,
    clearError,
  }
}

// ── Firebase error code → readable message ────────────────────────────
function friendlyError(code) {
  const map = {
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/user-disabled':            'This account has been disabled.',
    'auth/user-not-found':           'No account found with this email.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/email-already-in-use':     'An account with this email already exists.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/network-request-failed':   'Network error. Check your connection.',
    'auth/too-many-requests':        'Too many attempts. Please try again later.',
    'auth/popup-blocked':            'Popup blocked by browser. Please allow popups.',
    'auth/invalid-credential':       'Invalid credentials. Please check and try again.',
    'auth/operation-not-allowed':    'This sign-in method is not enabled.',
    'auth/account-exists-with-different-credential':
      'An account already exists with a different sign-in method.',
  }
  return map[code] ?? 'An unexpected error occurred. Please try again.'
}

export { auth }
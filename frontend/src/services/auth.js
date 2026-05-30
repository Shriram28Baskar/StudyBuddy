import { initializeApp, getApps, getApp } from 'firebase/app'
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
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth'

// ── Firebase config from environment ─────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

// ── Initialise app once (safe to import from multiple files) ──────────
const app  = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
const auth = getAuth(app)

// Set persistence to LOCAL so the user stays signed in across sessions
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Fallback to session persistence if local fails (e.g. private browsing)
  setPersistence(auth, browserSessionPersistence).catch(() => {})
})

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export { auth, app }

// ─────────────────────────────────────────────────────────────────────
// Auth helper functions
// All functions return { data, error } — no raw Firebase errors bubble up
// ─────────────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 */
export async function loginWithEmail(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password)
    return { data: cred.user, error: null }
  } catch (err) {
    return { data: null, error: parseAuthError(err.code) }
  }
}

/**
 * Create a new account with email, password, and optional display name.
 */
export async function registerWithEmail(email, password, displayName = '') {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) {
      await updateProfile(cred.user, { displayName })
    }
    return { data: cred.user, error: null }
  } catch (err) {
    return { data: null, error: parseAuthError(err.code) }
  }
}

/**
 * Sign in with Google via a popup.
 */
export async function loginWithGoogle() {
  try {
    const cred = await signInWithPopup(auth, googleProvider)
    return { data: cred.user, error: null }
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      return { data: null, error: null }   // user dismissed — not an error
    }
    return { data: null, error: parseAuthError(err.code) }
  }
}

/**
 * Sign the current user out.
 */
export async function logout() {
  try {
    await signOut(auth)
    return { error: null }
  } catch (err) {
    return { error: parseAuthError(err.code) }
  }
}

/**
 * Send a password-reset email.
 */
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email)
    return { error: null }
  } catch (err) {
    return { error: parseAuthError(err.code) }
  }
}

/**
 * Update the current user's display name and/or photo URL.
 */
export async function updateUserProfile({ displayName, photoURL } = {}) {
  try {
    const updates = {}
    if (displayName !== undefined) updates.displayName = displayName
    if (photoURL    !== undefined) updates.photoURL    = photoURL
    await updateProfile(auth.currentUser, updates)
    return { error: null }
  } catch (err) {
    return { error: parseAuthError(err.code) }
  }
}

/**
 * Get the current user's Firebase ID token.
 * Pass to backend as: Authorization: Bearer <token>
 */
export async function getIdToken(forceRefresh = false) {
  try {
    if (!auth.currentUser) return null
    return await auth.currentUser.getIdToken(forceRefresh)
  } catch {
    return null
  }
}

/**
 * Subscribe to auth state changes.
 * Returns the unsubscribe function — call it on component unmount.
 *
 * Usage:
 *   const unsub = onAuthChange((user) => setUser(user))
 *   return () => unsub()
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

/**
 * Get the currently signed-in user synchronously.
 * Returns null if no user is signed in.
 */
export function getCurrentUser() {
  return auth.currentUser
}

// ── Error code → human-readable message ──────────────────────────────
function parseAuthError(code) {
  const messages = {
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/user-disabled':            'This account has been disabled. Contact support.',
    'auth/user-not-found':           'No account found with this email address.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/email-already-in-use':     'An account already exists with this email.',
    'auth/weak-password':            'Password must be at least 6 characters long.',
    'auth/network-request-failed':   'Network error. Please check your connection.',
    'auth/too-many-requests':        'Too many failed attempts. Try again later.',
    'auth/popup-blocked':            'Popup was blocked. Please allow popups for this site.',
    'auth/invalid-credential':       'Invalid credentials. Please check your details.',
    'auth/operation-not-allowed':    'This sign-in method is not enabled.',
    'auth/requires-recent-login':    'Please sign in again to complete this action.',
    'auth/account-exists-with-different-credential':
      'An account already exists with a different sign-in method for this email.',
    'auth/credential-already-in-use':
      'This credential is already associated with another account.',
  }
  return messages[code] ?? 'An unexpected error occurred. Please try again.'
}
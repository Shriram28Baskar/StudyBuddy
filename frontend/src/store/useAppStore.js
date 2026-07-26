import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * useAppStore — global Zustand store
 *
 * Persisted slices (saved to localStorage):
 *   - auth        user identity & API key
 *   - preferences subject, level, theme, sidebar
 *   - documents   uploaded doc metadata
 *
 * Ephemeral slices (reset on page reload):
 *   - ui          loading flags, active modal, toast
 *   - studyPlan   last generated plan
 *   - roadmap     last generated roadmap
 *   - career      last career roles
 *   - mindmap     last generated mind map
 */

// ── Helper ────────────────────────────────────────────────────────────
const now = () => new Date().toISOString()

// ─────────────────────────────────────────────────────────────────────
// Store definition
// ─────────────────────────────────────────────────────────────────────
const useAppStore = create(
  persist(
    (set, get) => ({

      // ── Auth slice ──────────────────────────────────────────────────
      auth: {
        user:        null,   // Firebase user object (uid, email, displayName, photoURL)
        isLoggedIn:  false,
      },

      // Separate from auth so it doesn't get persisted accidentally
      authLoading: true,   // true until Firebase resolves onAuthStateChanged

      setAuthLoading: (loading) => set({ authLoading: loading }),

      setUser: (user) =>
        set((state) => ({
          auth: {
            ...state.auth,
            user,
            isLoggedIn: !!user,
          },
        })),



      clearAuth: () =>
        set((state) => ({
          auth: { ...state.auth, user: null, isLoggedIn: false },
        })),

      // ── User preferences slice ──────────────────────────────────────
      preferences: {
        subject:         'General',
        topic:           '',
        level:           'beginner',     // 'beginner' | 'intermediate' | 'advanced'
        sidebarCollapsed: false,
        theme:           'dark',          // 'dark' | 'light' (future use)
        fontSize:        'md',            // 'sm' | 'md' | 'lg'
      },

      setSubject: (subject) =>
        set((state) => ({
          preferences: { ...state.preferences, subject },
        })),

      setTopic: (topic) =>
        set((state) => ({
          preferences: { ...state.preferences, topic },
        })),

      setLevel: (level) =>
        set((state) => ({
          preferences: { ...state.preferences, level },
        })),

      toggleSidebar: () =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            sidebarCollapsed: !state.preferences.sidebarCollapsed,
          },
        })),

      setFontSize: (fontSize) =>
        set((state) => ({
          preferences: { ...state.preferences, fontSize },
        })),

      // ── UI slice (ephemeral) ────────────────────────────────────────
      ui: {
        activeModal:  null,    // string id of the open modal, or null
        toast:        null,    // { message, type: 'success'|'error'|'info', id }
        globalLoader: false,
      },

      openModal: (modalId) =>
        set((state) => ({ ui: { ...state.ui, activeModal: modalId } })),

      closeModal: () =>
        set((state) => ({ ui: { ...state.ui, activeModal: null } })),

      showToast: (message, type = 'info') => {
        const id = Math.random().toString(36).slice(2)
        set((state) => ({ ui: { ...state.ui, toast: { message, type, id } } }))
        // Auto-dismiss after 3.5 seconds
        setTimeout(() => {
          // Only clear if this toast is still the active one
          if (get().ui.toast?.id === id) {
            set((state) => ({ ui: { ...state.ui, toast: null } }))
          }
        }, 3500)
      },

      clearToast: () =>
        set((state) => ({ ui: { ...state.ui, toast: null } })),

      setGlobalLoader: (loading) =>
        set((state) => ({ ui: { ...state.ui, globalLoader: loading } })),

      // ── Documents slice (persisted) ─────────────────────────────────
      // Tracks metadata for docs the user has uploaded so they can
      // re-query them without re-uploading across page reloads.
      documents: [],      // [{ docId, filename, chunkCount, uploadedAt }]

      addDocument: ({ docId, filename, chunkCount, topics = [] }) =>
        set((state) => ({
          documents: [
            { docId, filename, chunkCount, topics, uploadedAt: now() },
            // Deduplicate by docId in case of re-upload
            ...state.documents.filter((d) => d.docId !== docId),
          ].slice(0, 20),   // keep at most 20 recent docs
        })),

      setDocumentTopics: (docId, topics) =>
        set((state) => ({
          documents: state.documents.map((d) =>
            d.docId === docId ? { ...d, topics } : d
          ),
        })),

      removeDocument: (docId) =>
        set((state) => ({
          documents: state.documents.filter((d) => d.docId !== docId),
        })),

      clearDocuments: () => set({ documents: [] }),

      // ── Study Plan slice (ephemeral) ────────────────────────────────
      studyPlan: null,   // { plan: DayPlan[], summary, generatedAt }

      setStudyPlan: (data) =>
        set({ studyPlan: data ? { ...data, generatedAt: now() } : null }),

      clearStudyPlan: () => set({ studyPlan: null }),

      // ── Roadmap slice (ephemeral) ───────────────────────────────────
      roadmap: null,   // { goal, phases: Phase[], generatedAt }

      setRoadmap: (data) =>
        set({ roadmap: data ? { ...data, generatedAt: now() } : null }),

      clearRoadmap: () => set({ roadmap: null }),

      // ── Career slice (ephemeral) ────────────────────────────────────
      career: null,   // { roles: Role[], generatedAt }

      setCareer: (data) =>
        set({ career: data ? { ...data, generatedAt: now() } : null }),

      clearCareer: () => set({ career: null }),

      // ── Mind Map slice (ephemeral) ──────────────────────────────────
      mindmap: null,   // { topic, nodes: MindMapNode[], generatedAt }

      setMindmap: (data) =>
        set({ mindmap: data ? { ...data, generatedAt: now() } : null }),

      clearMindmap: () => set({ mindmap: null }),

      // ── Global reset (call on logout) ───────────────────────────────
      resetStore: () =>
        set({
          auth: {
            user:       null,
            isLoggedIn: false,
          },
          authLoading: false,
          ui: {
            activeModal:  null,
            toast:        null,
            globalLoader: false,
          },
          studyPlan: null,
          roadmap:   null,
          career:    null,
          mindmap:   null,
          // documents and preferences are intentionally kept
        }),
    }),

    // ── Persist config ────────────────────────────────────────────────
    {
      name:    'studybuddy-store',
      storage: createJSONStorage(() => localStorage),

      // Only persist these keys — UI and generated content are ephemeral
      partialize: (state) => ({
        auth: {
          // Never persist the full user object — re-hydrate from Firebase on load
        },
        preferences: state.preferences,
        documents:   state.documents,
      }),
    }
  )
)

export default useAppStore

// ── Typed selectors (avoids selector recreation on every render) ──────
export const selectUser         = (s) => s.auth.user
export const selectIsLoggedIn   = (s) => s.auth.isLoggedIn
export const selectPreferences  = (s) => s.preferences
export const selectSubject      = (s) => s.preferences.subject
export const selectLevel        = (s) => s.preferences.level
export const selectDocuments    = (s) => s.documents
export const selectStudyPlan    = (s) => s.studyPlan
export const selectRoadmap      = (s) => s.roadmap
export const selectCareer       = (s) => s.career
export const selectMindmap      = (s) => s.mindmap
export const selectToast        = (s) => s.ui.toast
export const selectActiveModal  = (s) => s.ui.activeModal
export const selectGlobalLoader = (s) => s.ui.globalLoader
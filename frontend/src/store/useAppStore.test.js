import { describe, it, expect, beforeEach } from 'vitest'
import useAppStore from './useAppStore'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.getState().resetStore()
  })

  it('initializes with default preferences', () => {
    const preferences = useAppStore.getState().preferences
    expect(preferences.subject).toBe('General')
    expect(preferences.level).toBe('beginner')
    expect(preferences.theme).toBe('dark')
  })

  it('updates subject preference correctly', () => {
    useAppStore.getState().setSubject('Mathematics')
    expect(useAppStore.getState().preferences.subject).toBe('Mathematics')
  })

  it('handles user login and logout', () => {
    const mockUser = { uid: 'user-123', email: 'test@example.com' }
    
    // Login
    useAppStore.getState().setUser(mockUser)
    expect(useAppStore.getState().auth.user).toEqual(mockUser)
    expect(useAppStore.getState().auth.isLoggedIn).toBe(true)

    // Logout
    useAppStore.getState().clearAuth()
    expect(useAppStore.getState().auth.user).toBeNull()
    expect(useAppStore.getState().auth.isLoggedIn).toBe(false)
  })

  it('toggles sidebar state', () => {
    const initialSidebarState = useAppStore.getState().preferences.sidebarCollapsed
    useAppStore.getState().toggleSidebar()
    expect(useAppStore.getState().preferences.sidebarCollapsed).toBe(!initialSidebarState)
  })

  it('manages UI toasts correctly', () => {
    // Show toast
    useAppStore.getState().showToast('Test message', 'success')
    const toast = useAppStore.getState().ui.toast
    expect(toast).toBeDefined()
    expect(toast.message).toBe('Test message')
    expect(toast.type).toBe('success')

    // Clear toast
    useAppStore.getState().clearToast()
    expect(useAppStore.getState().ui.toast).toBeNull()
  })
})

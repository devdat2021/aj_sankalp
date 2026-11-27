import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import { api } from '../services/api'
import { supabase, allowDemo } from '../services/auth'
import { setCrisisToken } from '../portals/port/services/crisisApi'

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ token: '', user: null, accountId: '', accountEmail: '', accessStatus: '', loading: true, error: '' })
  const generation = useRef(0)
  const resolve = useCallback(async (token, accountId = '', accountEmail = '') => {
    const version = ++generation.current
    if (!token) { setCrisisToken(''); setAuth({ token: '', user: null, accountId: '', accountEmail: '', accessStatus: '', loading: false, error: '' }); return }
    setAuth(previous => ({ ...previous, loading: true, error: '' }))
    try {
      const user = await api('/me', token)
      if (version === generation.current) { setCrisisToken(token); setAuth({ token, user, accountId: '', accountEmail: '', accessStatus: '', loading: false, error: '' }) }
    } catch (error) {
      const accessStatus = error?.status === 403 ? 'pending' : 'unavailable'
      // Keep accountId/accountEmail so the UI can show "Check access again" / "Sign out" buttons.
      if (version === generation.current) {
        setCrisisToken('')
        setAuth({ token: '', user: null, accountId: accountId || 'unknown', accountEmail, accessStatus, loading: false, error: error.message })
      }
      throw error
    }
  }, [])
  useEffect(() => {
    const sequence = generation
    if (!supabase) {
      const initial = setTimeout(() => resolve(allowDemo ? sessionStorage.getItem('coastwatch.demo') || '' : '').catch(() => {}), 0)
      return () => clearTimeout(initial)
    }
    // Session events also cover token refresh; role always comes from the backend.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session?.access_token || '', session?.user?.id || '', session?.user?.email || '').catch(() => {})
    })
    return () => { sequence.current++; subscription.unsubscribe() }
  }, [resolve])
  async function login(email, password) {
    if (!supabase) throw new Error('Supabase sign-in is not configured yet.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }
  async function register(name, email, password, requestedRole = '') {
    if (!supabase) throw new Error('Supabase sign-up is not configured yet.')
    const safeRole = ['port', 'logistics', 'driver', 'captain'].includes(requestedRole) ? requestedRole : ''
    const { data, error } = await supabase.auth.signUp({ email, password,
      options: {
        data: { display_name: name, ...(safeRole ? { requested_role: safeRole } : {}) },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (error) throw error
    return data
  }
  async function retryAccess() {
    if (!supabase) return
    // Refresh the token first so we never retry with an expired JWT.
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr || !refreshed?.session) {
      // Refresh failed — force sign-out so the user gets a clean login prompt.
      await supabase.auth.signOut({ scope: 'local' })
      setAuth({ token: '', user: null, accountId: '', accountEmail: '', accessStatus: '', loading: false, error: 'Session expired. Please sign in again.' })
      return
    }
    await resolve(refreshed.session.access_token, refreshed.session.user?.id || '', refreshed.session.user?.email || '')
  }
  async function demo(role) {
    if (!allowDemo || supabase) throw new Error('Demo login is disabled.')
    const health = await api('/health')
    if (!health.demo_mode) throw new Error('The backend has demo access disabled.')
    const token = `local-${role}-demo`
    await resolve(token)
    sessionStorage.setItem('coastwatch.demo', token)
  }
  async function logout() {
    sessionStorage.removeItem('coastwatch.demo')
    await resolve('')
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    }
  }
  return <AuthContext.Provider value={{ ...auth, login, register, retryAccess, demo, logout }}>{children}</AuthContext.Provider>
}

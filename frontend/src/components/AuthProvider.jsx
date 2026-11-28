import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import { api } from '../services/api'
import { getSupabase, hasSupabase, allowDemo } from '../services/auth'
import { setCrisisToken } from '../portals/port/services/crisisApi'

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ token: '', user: null, accountId: '', accountEmail: '', accessStatus: '', loading: true, error: '' })
  const generation = useRef(0)
  const resolvedRef = useRef({ token: '', hasUser: false })
  const resolve = useCallback(async (token, accountId = '', accountEmail = '') => {
    if (token && token === resolvedRef.current.token && resolvedRef.current.hasUser) return
    const version = ++generation.current
    if (!token) {
      resolvedRef.current = { token: '', hasUser: false }
      setCrisisToken('')
      setAuth({ token: '', user: null, accountId: '', accountEmail: '', accessStatus: '', loading: false, error: '' })
      return
    }
    if (!resolvedRef.current.hasUser) {
      setAuth(previous => ({ ...previous, loading: true, error: '' }))
    }
    try {
      const user = await api('/me', token)
      if (version === generation.current) {
        resolvedRef.current = { token, hasUser: true }
        setCrisisToken(token)
        setAuth({ token, user, accountId: '', accountEmail: '', accessStatus: '', loading: false, error: '' })
      }
    } catch (error) {
      const accessStatus = error?.status === 403 ? 'pending' : 'unavailable'
      // Keep accountId/accountEmail so the UI can show "Check access again" / "Sign out" buttons.
      if (version === generation.current) {
        resolvedRef.current = { token: '', hasUser: false }
        setCrisisToken('')
        setAuth({ token: '', user: null, accountId: accountId || 'unknown', accountEmail, accessStatus, loading: false, error: error.message })
      }
      throw error
    }
  }, [])
  useEffect(() => {
    let active = true
    let subscription
    const sequence = generation
    if (!hasSupabase) {
      const initial = setTimeout(() => resolve(allowDemo ? sessionStorage.getItem('coastwatch.demo') || '' : '').catch(() => {}), 0)
      return () => { active = false; clearTimeout(initial) }
    }
    getSupabase().then(client => {
      if (!active || !client) return
      const { data: { subscription: authSubscription } } = client.auth.onAuthStateChange((_event, session) => {
        resolve(session?.access_token || '', session?.user?.id || '', session?.user?.email || '').catch(() => {})
      })
      subscription = authSubscription
    }).catch(() => {
      if (active) setAuth(previous => ({ ...previous, loading: false, error: 'Sign-in service could not be loaded. Refresh and try again.' }))
    })
    return () => { active = false; sequence.current++; subscription?.unsubscribe() }
  }, [resolve])
  async function login(email, password) {
    const supabase = await getSupabase()
    if (!supabase) throw new Error('Supabase sign-in is not configured yet.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }
  async function register(name, email, password, requestedRole = '') {
    const supabase = await getSupabase()
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
    const supabase = await getSupabase()
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
    if (!allowDemo || hasSupabase) throw new Error('Demo login is disabled.')
    const health = await api('/health')
    if (!health.demo_mode) throw new Error('The backend has demo access disabled.')
    const token = `local-${role}-demo`
    await resolve(token)
    sessionStorage.setItem('coastwatch.demo', token)
  }
  async function logout() {
    sessionStorage.removeItem('coastwatch.demo')
    await resolve('')
    const supabase = await getSupabase()
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    }
  }
  return <AuthContext.Provider value={{ ...auth, login, register, retryAccess, demo, logout }}>{children}</AuthContext.Provider>
}

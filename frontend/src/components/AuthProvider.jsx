import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import { api } from '../services/api'
import { supabase, allowDemo } from '../services/auth'
import { setCrisisToken } from '../portals/port/services/crisisApi'

export default function AuthProvider({ children }) {
  const [auth, setAuth] = useState({ token: '', user: null, loading: true, error: '' })
  const generation = useRef(0)
  const resolve = useCallback(async token => {
    const version = ++generation.current
    if (!token) { setCrisisToken(''); setAuth({ token: '', user: null, loading: false, error: '' }); return }
    setAuth(previous => ({ ...previous, loading: !previous.user, error: '' }))
    try {
      const user = await api('/me', token)
      if (version === generation.current) { setCrisisToken(token); setAuth({ token, user, loading: false, error: '' }) }
    } catch (error) {
      if (version === generation.current) { setCrisisToken(''); setAuth({ token: '', user: null, loading: false, error: error.message }) }
      throw error
    }
  }, [])
  useEffect(() => {
    if (!supabase) {
      const initial = setTimeout(() => resolve(allowDemo ? sessionStorage.getItem('coastwatch.demo') || '' : '').catch(() => {}), 0)
      return () => clearTimeout(initial)
    }
    // Session events also cover token refresh; role always comes from the backend.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolve(session?.access_token || '').catch(() => {})
    })
    return () => subscription.unsubscribe()
  }, [resolve])
  async function login(email, password) {
    if (!supabase) throw new Error('Supabase sign-in is not configured yet.')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
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
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    }
    sessionStorage.removeItem('coastwatch.demo')
    await resolve('')
  }
  return <AuthContext.Provider value={{ ...auth, login, demo, logout }}>{children}</AuthContext.Provider>
}

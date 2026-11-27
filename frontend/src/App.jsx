import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import DriverWork from './portals/driver/DriverWork'
import AuthProvider from './components/AuthProvider'
import { useAuth } from './components/AuthContext'
import Workspace from './components/Workspace'
import Landing from './components/Landing'
import AuthPage from './components/AuthPage'
import { roles } from './services/roles'
import { supabase, allowDemo } from './services/auth'
import { ActionButton } from './components/Forms'
import './coordination.css'
import './workspace.css'
import './portals/driver/display.css'

function Home() {
  const auth = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (auth.loading) return <main className="cw-loading">Checking your session…</main>
  if (auth.user && roles[auth.user.role]) return <Navigate to={`/${auth.user.role}`} replace />
  async function enter(role) {
    setBusy(true); setError('')
    try { await auth.demo(role) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Landing enter={enter} busy={busy} demoEnabled={allowDemo} hasSignIn={Boolean(supabase)}>
    {(error || auth.error) && <div role="alert" className="cw-error"><p>{error || auth.error}</p>{auth.error && <><p>If your account has no access yet, ask an administrator to assign your role.</p><ActionButton action={auth.logout}>Clear session</ActionButton></>}</div>}
    {auth.user && !roles[auth.user.role] && <section className="workflow-content cw-card"><p>Your account needs a supported role mapping.</p><ActionButton action={auth.logout}>Sign out</ActionButton></section>}
    {supabase && <section className="workflow-content cw-login cw-card"><h2>Your workspace awaits</h2><p>Sign in or create an account to join your team.</p><div className="cw-actions"><Link to="/login">Sign in</Link><Link to="/register">Create an account</Link></div></section>}
  </Landing>
}

function SignedInRoutes() {
  return <AuthProvider><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<AuthPage key="login" />} />
    <Route path="/register" element={<AuthPage key="register" mode="register" />} />
    {Object.keys(roles).map(role => <Route key={role} path={`/${role}`} element={<Workspace role={role} />} />)}
    <Route path="/caption" element={<Navigate to="/captain" replace />} />
    <Route path="/truck" element={<Navigate to="/driver" replace />} />
    <Route path="/truck-operator" element={<Navigate to="/driver" replace />} />
    <Route path="*" element={<main className="cw-loading">Page not found. <Link to="/">Return to CoastWatch</Link></main>} />
  </Routes></AuthProvider>
}

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/driver/work" element={<DriverWork />} />
    <Route path="*" element={<SignedInRoutes />} />
  </Routes></BrowserRouter>
}

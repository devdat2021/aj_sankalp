import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import AuthProvider from './components/AuthProvider'
import { useAuth } from './components/AuthContext'
import Workspace from './components/Workspace'
import { roles } from './services/roles'
import { supabase, allowDemo } from './services/auth'
import { ActionButton, ActionForm, Field } from './components/Forms'
import './coordination.css'

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
  return <main className="portal-home"><h1>CoastWatch</h1><p>Coastal supply chain operations</p>
    {(error || auth.error) && <p role="alert" className="cw-error">{error || auth.error}</p>}
    {auth.user && !roles[auth.user.role] && <section className="cw-card"><p>Your account needs a supported role mapping.</p><ActionButton action={auth.logout}>Sign out</ActionButton></section>}
    {supabase ? <section className="workflow-content cw-login"><h2>Sign in to your workspace</h2><p>Your account determines your role and assignments.</p><ActionForm label="Sign in" submit={f => auth.login(f.email, f.password)}><Field label="Email" name="email" type="email" autoComplete="username" /><Field label="Password" name="password" type="password" autoComplete="current-password" /></ActionForm></section> : <><div className="portal-links">{Object.entries(roles).map(([role, { name, description, icon: Icon }]) => <article className="cw-card" key={role}><Icon size={28} /><h2>{name}</h2><p>{description}</p>{allowDemo && <button disabled={busy} onClick={() => enter(role)}>{busy ? 'Connecting…' : `Enter ${name.toLowerCase()} demo`}</button>}</article>)}</div><p className="cw-muted">{allowDemo ? 'Demo access uses the backend’s shared records. Sign out to switch roles.' : 'Sign-in is not configured. Ask your administrator to enable access.'}</p></>}
  </main>
}

export default function App() {
  return <BrowserRouter><AuthProvider><nav className="portal-nav" aria-label="Portals"><Link to="/">CoastWatch</Link><Link to="/driver">Driver</Link><Link to="/port">Port authority</Link><Link to="/logistics">Logistics</Link><Link to="/captain">Captain</Link></nav><Routes><Route path="/" element={<Home />} />{Object.keys(roles).map(role => <Route key={role} path={`/${role}`} element={<Workspace role={role} />} />)}<Route path="*" element={<main className="cw-loading">Page not found. <Link to="/">Return to CoastWatch</Link></main>} /></Routes></AuthProvider></BrowserRouter>
}

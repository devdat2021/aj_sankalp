import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Anchor, Eye, EyeOff, ShieldCheck, Mail, TriangleAlert } from 'lucide-react'
import { useAuth } from './AuthContext'
import { supabase } from '../services/auth'
import { roles } from '../services/roles'
import { ActionButton } from './Forms'
import '../auth.css'

export default function AuthPage({ mode = 'login' }) {
  const auth = useAuth()
  const registering = mode === 'register'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  if (auth.user && roles[auth.user.role]) return <Navigate to={`/${auth.user.role}`} replace />
  async function submit(event) {
    event.preventDefault()
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    setError('')
    if (registering && fields.password !== fields.confirm) { setError('Passwords do not match.'); return }
    if (registering && !fields.name.trim()) { setError('Enter your name.'); return }
    setBusy(true)
    try {
      if (registering) {
        const data = await auth.register(fields.name.trim(), fields.email.trim(), fields.password, fields.requestedRole)
        setResult({ hasSession: Boolean(data.session) })
      } else await auth.login(fields.email.trim(), fields.password)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <main className="cw-auth">
    <section className={`auth-story ${busy || auth.loading ? "is-loading" : ""}`}>
      <Link className="auth-brand" to="/"><Anchor size={26} aria-hidden="true" />CoastWatch<span>.</span></Link>
      <div className="auth-story-copy"><p className="auth-eyebrow">CONNECTED COASTAL OPERATIONS</p><h1>One account.<br />Your part of<br /><em>the journey.</em></h1><p>Keep cargo, people and decisions connected — from sea to road.</p><div className="auth-journey"><span>Sea</span><i /><span>Port</span><i /><span>Road</span></div></div>
      <p className="auth-trust"><ShieldCheck size={20} aria-hidden="true" />Access tailored to your responsibilities.</p>
    </section>
    <section className="auth-panel" aria-labelledby="auth-title">
      <Link className="auth-back" to="/">Back to CoastWatch</Link>
      <div className="auth-card">
        <p className="auth-eyebrow">YOUR WORKSPACE STARTS HERE</p>
        <h2 id="auth-title">{result ? (result.hasSession ? 'You’re registered' : 'Check your email') : registering ? 'Create your account' : 'Welcome back'}</h2>
        {result ? <div className="auth-confirmation" role="status"><Mail size={32} aria-hidden="true" /><p>{result.hasSession ? 'Your account is ready for an administrator to assign access.' : 'If this email is eligible for registration, you’ll receive a confirmation link. Open it to verify your email, then sign in.'}</p><p>An administrator will assign your role and workspace. Already registered? Sign in with your existing password.</p><Link className="auth-submit" to="/login">Go to sign in</Link></div> : <>
          <p className="auth-subtitle">{registering ? 'Join your team. Your administrator will assign the right workspace.' : 'Sign in to continue to your assigned workspace.'}</p>
          {!supabase && <p className="auth-error" role="alert">Sign-in is not configured yet. Contact your administrator.</p>}
          {(error || auth.error) && <div className="auth-error" role="alert">
            <TriangleAlert size={20} aria-hidden="true" /><p>{error || auth.error}</p>
            {!error && <>
              {auth.accountId && <p>Account reference <code>{auth.accountId}</code></p>}
              {auth.accessStatus === 'pending'
                ? <p>Your account {auth.accountEmail ? `(${auth.accountEmail}) ` : ''}is awaiting administrator role &amp; scope assignment.</p>
                : auth.accessStatus === 'unavailable'
                  ? <p>Session may have expired or the backend is unreachable. Click <strong>Check access again</strong> to refresh, or sign out and sign back in.</p>
                  : null}
              <div className="auth-access-actions"><ActionButton action={auth.retryAccess}>Check access again</ActionButton><ActionButton action={auth.logout}>Sign out</ActionButton></div>
            </>}
          </div>}
          <form onSubmit={submit} className="auth-form">
            <fieldset disabled={busy || auth.loading || !supabase}>
              {registering && <label>Full name<input name="name" autoComplete="name" required maxLength={120} placeholder="Your full name" /></label>}
              {registering && <label>Requested role<select name="requestedRole" defaultValue="port" required>
                <option value="port">Port Operations</option>
                <option value="logistics">Logistics Company</option>
                <option value="driver">Truck Operator</option>
                <option value="captain">Vessel Captain</option>
              </select></label>}
              <label>Email address<input name="email" type="email" autoComplete="username" required placeholder="you@company.com" /></label>
              <label>Password<div className="auth-password"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 8 : undefined} aria-describedby={registering ? 'password-help' : undefined} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
              {registering && <><p id="password-help" className="auth-help">Use at least 8 characters.</p><label>Confirm password<input name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} /></label></>}
              <button className="auth-submit" type="submit">{(busy || auth.loading) && <span className="auth-spinner" aria-hidden="true" />}{busy || auth.loading ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
            </fieldset>
          </form>
          <p className="auth-switch">{registering ? 'Already have an account?' : 'New to CoastWatch?'} <Link to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link></p>
        </>}
        <p className="auth-footer"><ShieldCheck size={16} aria-hidden="true" />Your role is assigned by an administrator.</p>
      </div>
    </section>
  </main>
}

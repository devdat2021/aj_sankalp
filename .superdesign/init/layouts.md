# Layouts
Home navigation is inline in App.jsx and exists only on /. Operational shell is separate; do not redesign it.

## frontend/src/App.jsx
```
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import AuthProvider from './components/AuthProvider'
import { useAuth } from './components/AuthContext'
import Workspace from './components/Workspace'
import { roles } from './services/roles'
import { supabase, allowDemo } from './services/auth'
import { ActionButton, ActionForm, Field } from './components/Forms'
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
  return <main className="portal-home"><h1>CoastWatch</h1><p>Coastal supply chain operations</p>
    {(error || auth.error) && <p role="alert" className="cw-error">{error || auth.error}</p>}
    {auth.user && !roles[auth.user.role] && <section className="cw-card"><p>Your account needs a supported role mapping.</p><ActionButton action={auth.logout}>Sign out</ActionButton></section>}
    {supabase ? <section className="workflow-content cw-login"><h2>Sign in to your workspace</h2><p>Your account determines your role and assignments.</p><ActionForm label="Sign in" submit={f => auth.login(f.email, f.password)}><Field label="Email" name="email" type="email" autoComplete="username" /><Field label="Password" name="password" type="password" autoComplete="current-password" /></ActionForm></section> : <><div className="portal-links">{Object.entries(roles).map(([role, { name, description, icon: Icon }]) => <article className="cw-card" key={role}><Icon size={28} /><h2>{name}</h2><p>{description}</p>{allowDemo && <button disabled={busy} onClick={() => enter(role)}>{busy ? 'Connecting…' : `Enter ${name.toLowerCase()} demo`}</button>}</article>)}</div><p className="cw-muted">{allowDemo ? 'Demo access uses the backend’s shared records. Sign out to switch roles.' : 'Sign-in is not configured. Ask your administrator to enable access.'}</p></>}
  </main>
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/" element={<><nav className="portal-nav" aria-label="Portals"><Link to="/">CoastWatch</Link><Link to="/driver">Driver</Link><Link to="/port">Port authority</Link><Link to="/logistics">Logistics</Link><Link to="/captain">Captain</Link></nav><Home /></>} />{Object.keys(roles).map(role => <Route key={role} path={`/${role}`} element={<Workspace role={role} />} />)}<Route path="/caption" element={<Navigate to="/captain" replace />} /><Route path="/truck" element={<Navigate to="/driver" replace />} /><Route path="/truck-operator" element={<Navigate to="/driver" replace />} /><Route path="*" element={<main className="cw-loading">Page not found. <Link to="/">Return to CoastWatch</Link></main>} /></Routes></AuthProvider></BrowserRouter>
}

```

## frontend/src/components/Workspace.jsx
```
import { stamp } from '../services/format'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Package, Ship, Bell, LayoutDashboard, ClipboardList, TriangleAlert, MapPin, CloudSun, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthContext'
import { api } from '../services/api'
import { roles } from '../services/roles'
import WorkspaceNav from './WorkspaceNav'
import Cargo from './Cargo'
import Requests from './Requests'
import { Alerts, Capacity, Incidents, Tracking, VesselOperations } from './Operations'
import Weather from './Weather'
import { ActionButton } from './Forms'
import ControlTowerMap from '../portals/port/components/ControlTowerMap'
import PortPortal from '../portals/port/PortPortal'
import DriverPortal from '../portals/driver/DriverPortal'
import '../portals/port/port.css'



function Dashboard({ user, token, logout }) {
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [updated, setUpdated] = useState(null)
  const [expired, setExpired] = useState(false)
  const sequence = useRef(0)
  const refresh = useCallback(async signal => {
    const request = ++sequence.current
    setRefreshing(true)
    try {
      const next = await api(`/${user.role}/dashboard`, token, 'GET', undefined, signal)
      if (!signal?.aborted && request === sequence.current) { setData(next); setError(''); setUpdated(new Date().toISOString()); setExpired(false) }
    } catch (err) {
      if (!signal?.aborted && request === sequence.current) { setError(err.message); if (err.status === 401 || err.status === 403) setExpired(true) }
    } finally { if (!signal?.aborted && request === sequence.current) setRefreshing(false) }
  }, [user.role, token])
  useEffect(() => {
    const controller = new AbortController()
    const initial = setTimeout(() => refresh(controller.signal), 0)
    const interval = setInterval(() => { if (!document.hidden) refresh(controller.signal) }, 8000)
    return () => { controller.abort(); clearTimeout(initial); clearInterval(interval) }
  }, [refresh])
  async function mutate(path, method, body) {
    const result = await api(path, token, method, body)
    await refresh()
    return result
  }
  const tabs = [['Overview', LayoutDashboard], ['Consignments', Package], ['Requests', ClipboardList], ...(user.role === 'captain' ? [['Vessel operations', Ship]] : []), ['Tracking', MapPin], ['Incidents', TriangleAlert], ['Notifications', Bell], ['Weather', CloudSun]]
  const unread = data?.alerts.filter(a => !a.read_by.includes(user.id)).length || 0
  const activeShipments = data?.shipments.filter(shipment => shipment.status !== 'delivered') || []
  const metrics = data && [
    ['Active consignments', activeShipments.length],
    ['Pending reroutes', data.requests.filter(request => request.status === 'pending').length],
    ['Pending port access', data.port_requests.filter(request => request.status === 'pending').length],
    ['Assigned route delays', activeShipments.filter(shipment => shipment.route?.delay_hours > 0).length],
    ['Critical alerts', data.alerts.filter(alert => alert.severity === 'critical' && !alert.read_by.includes(user.id)).length],
    ['Temperature exceptions', activeShipments.filter(shipment => shipment.requires_cold && shipment.temperature != null &&
      shipment.max_temperature != null && shipment.temperature > shipment.max_temperature).length],
  ]
  const props = { data, user, mutate, token }
  return <div className="coordination-root cw-shell"><WorkspaceNav role={roles[user.role].name} tabs={tabs} current={tab} onSelect={setTab} user={user} logout={logout} unread={unread} />
    <main className="cw-main"><div className="cw-content"><div className="cw-heading"><div><h1>{tab === 'Overview' ? (user.role === 'captain' ? 'Vessel overview' : 'Logistics overview') : tab}</h1><p>{token.startsWith('local-') ? 'Demo workspace · ' : ''}{data?.port.name || 'CoastWatch'} · {updated ? `Updated ${stamp(updated)}` : 'Connecting to operations'}</p></div><button disabled={refreshing} onClick={() => refresh()}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      {error && <div className="cw-error" role="alert">{error}{data && <p>Showing the last successful update. It may be out of date.</p>}</div>}
      {expired ? <section className="cw-card"><h2>Sign-in required</h2><p>Your session or access has changed.</p><ActionButton action={logout}>Return to sign in</ActionButton></section> : !data ? <p role="status">{error ? 'Unable to load operations. Check the backend and retry.' : 'Loading your workspace…'}</p> : <>
        {tab === 'Overview' && <div className="cw-stack"><div className="cw-stats">{metrics.map(([label, count]) => <article key={label}><small>{label}</small><strong>{count}</strong></article>)}</div><Capacity {...props} /><section className="cw-card"><h2>Transport overview</h2><ControlTowerMap data={data} /><p className="cw-muted">Reported or seeded positions. No automatic GPS/AIS feed is connected.</p></section><details className="cw-card overview-weather"><summary>Port weather</summary><Weather port={data.port} token={token} /></details></div>}
        {tab === 'Consignments' && <Cargo {...props} />}{tab === 'Requests' && <Requests {...props} />}{tab === 'Incidents' && <Incidents {...props} />}{tab === 'Notifications' && <Alerts {...props} />}{tab === 'Tracking' && <Tracking {...props} />}{tab === 'Vessel operations' && <VesselOperations {...props} />}{tab === 'Weather' && <Weather port={data.port} token={token} />}

      </>}
      </div></main></div>
}

export default function Workspace({ role }) {
  const auth = useAuth()
  if (auth.loading) return <main className="cw-loading">Checking your session…</main>
  if (!auth.user) return <Navigate to="/" replace />
  if (!roles[auth.user.role]) return <main className="cw-loading">Your account has an unsupported role. Contact your administrator.</main>
  if (auth.user.role !== role) return <Navigate to={`/${auth.user.role}`} replace />
  if (role === 'port') return <div className="port-portal"><PortPortal key={auth.user.id} /></div>
  if (role === 'driver') return <DriverPortal key={auth.user.id} />
  return <Dashboard key={auth.user.id} {...auth} />
}

```

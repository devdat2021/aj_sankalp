import { stamp } from '../services/format'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Anchor, Package, Ship, Bell, LayoutDashboard, ClipboardList, TriangleAlert, MapPin, CloudSun, LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthContext'
import { api } from '../services/api'
import { roles } from '../services/roles'
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
  const props = { data, user, mutate }
  return <div className="coordination-root cw-shell"><aside className="cw-sidebar"><Link to="/" className="cw-brand"><Anchor size={26} /><span>COASTWATCH<small>COASTAL COORDINATION</small></span></Link><p className="cw-nav-label">{roles[user.role]?.name}</p><nav aria-label="Workspace">{tabs.map(([name, Icon]) => <button key={name} className={tab === name ? 'active' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}><Icon size={18} />{name}{name === 'Notifications' && unread > 0 && <span className="cw-count">{unread}</span>}</button>)}</nav><div className="cw-account"><strong>{user.name}</strong><small>{user.company_id || user.port_id || user.asset_id}</small><ActionButton action={logout}><LogOut size={16} /> Sign out</ActionButton></div></aside>
    <main className="cw-main"><header className="cw-topbar"><span>{roles[user.role]?.name} / {tab}</span><span className="cw-badge">{token.startsWith('local-') ? 'Demo workspace' : 'Signed in'}</span></header><div className="cw-content"><div className="cw-heading"><div><p className="cw-eyebrow">SHARED OPERATIONS</p><h1>{tab}</h1><p>{data?.port.name || 'CoastWatch'} · {updated ? `Updated ${stamp(updated)}` : 'Connecting to operations'}</p></div><button disabled={refreshing} onClick={() => refresh()}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      {error && <div className="cw-error" role="alert">{error}{data && <p>Showing the last successful update. It may be out of date.</p>}</div>}
      {expired ? <section className="cw-card"><h2>Sign-in required</h2><p>Your session or access has changed.</p><ActionButton action={logout}>Return to sign in</ActionButton></section> : !data ? <p role="status">{error ? 'Unable to load operations. Check the backend and retry.' : 'Loading your workspace…'}</p> : <>
        {tab === 'Overview' && <div className="cw-stack"><div className="cw-stats">{[['Consignments', data.shipments.length], ['Open incidents', data.incidents.filter(i => ['reported', 'confirmed'].includes(i.status)).length], ['Pending requests', (user.role === 'port' ? [...data.port_requests, ...data.docking_requests] : user.role === 'logistics' ? data.requests : [...data.requests, ...data.docking_requests]).filter(r => r.status === 'pending').length], ['Unread updates', unread]].map(([label, count]) => <article key={label}><small>{label}</small><strong>{count}</strong></article>)}</div><Capacity {...props} /><section className="cw-card"><h2>Transport overview</h2><ControlTowerMap data={data} /><p className="cw-muted">Reported or seeded positions. No automatic GPS/AIS feed is connected.</p></section><Weather port={data.port} token={token} /></div>}
        {tab === 'Consignments' && <Cargo {...props} />}{tab === 'Requests' && <Requests {...props} />}{tab === 'Incidents' && <Incidents {...props} />}{tab === 'Notifications' && <Alerts {...props} />}{tab === 'Tracking' && <Tracking {...props} />}{tab === 'Vessel operations' && <VesselOperations {...props} />}{tab === 'Weather' && <Weather port={data.port} token={token} />}

      </>}
      <footer className="cw-footer">CoastWatch · Shared information. Clearly assigned decisions.</footer></div></main></div>
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

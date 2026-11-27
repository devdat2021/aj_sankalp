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
import { ActionButton, ActionForm, Field } from './Forms'
import ControlTowerMap from '../portals/port/components/ControlTowerMap'



function Simulation({ mutate }) {
  const [result, setResult] = useState(null)
  return <section className="cw-card"><h2>Disruption estimate</h2><p>A what-if scenario; it does not change shipments or capacity.</p><ActionForm label="Estimate impact" submit={async f => setResult(await mutate('/simulation/run', 'POST', { duration_hours: Number(f.duration), severity: f.severity }))}><Field label="Duration (hours)" name="duration" type="number" min="1" max="168" value={12} /><Field label="Severity" name="severity" options={['low', 'medium', 'high']} /></ActionForm>{result && <><ul>{result.impacts.map(i => <li key={i.shipment_id}>{i.shipment_id}: +{i.delay_hours} h · cold-chain risk {i.cold_chain_risk}/100 · estimated cost ₹{i.cost}</li>)}</ul>{result.assumptions.map(a => <p className="cw-muted" key={a}>{a}</p>)}</>}</section>
}

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
  const tabs = [['Overview', LayoutDashboard], ['Consignments', Package], ['Requests', ClipboardList], ...(user.role === 'captain' ? [['Vessel operations', Ship]] : []), ['Tracking', MapPin], ['Incidents', TriangleAlert], ['Notifications', Bell], ['Weather', CloudSun], ...(user.role === 'port' ? [['Simulation', ClipboardList], ['Audit trail', ClipboardList]] : [])]
  const unread = data?.alerts.filter(a => !a.read_by.includes(user.id)).length || 0
  const props = { data, user, mutate }
  return <div className="cw-shell"><aside className="cw-sidebar"><Link to="/" className="cw-brand"><Anchor size={26} /><span>COASTWATCH<small>COASTAL COORDINATION</small></span></Link><p className="cw-nav-label">{roles[user.role]?.name}</p><nav aria-label="Workspace">{tabs.map(([name, Icon]) => <button key={name} className={tab === name ? 'active' : ''} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}><Icon size={18} />{name}{name === 'Notifications' && unread > 0 && <span className="cw-count">{unread}</span>}</button>)}</nav><div className="cw-account"><strong>{user.name}</strong><small>{user.company_id || user.port_id || user.asset_id}</small><ActionButton action={logout}><LogOut size={16} /> Sign out</ActionButton></div></aside>
    <main className="cw-main"><header className="cw-topbar"><span>{roles[user.role]?.name} / {tab}</span><span className="cw-badge">{token.startsWith('local-') ? 'Demo workspace' : 'Signed in'}</span></header><div className="cw-content"><div className="cw-heading"><div><p className="cw-eyebrow">SHARED OPERATIONS</p><h1>{tab}</h1><p>{data?.port.name || 'CoastWatch'} · {updated ? `Updated ${stamp(updated)}` : 'Connecting to operations'}</p></div><button disabled={refreshing} onClick={() => refresh()}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>
      {error && <div className="cw-error" role="alert">{error}{data && <p>Showing the last successful update. It may be out of date.</p>}</div>}
      {expired ? <section className="cw-card"><h2>Sign-in required</h2><p>Your session or access has changed.</p><ActionButton action={logout}>Return to sign in</ActionButton></section> : !data ? <p role="status">{error ? 'Unable to load operations. Check the backend and retry.' : 'Loading your workspace…'}</p> : <>
        {tab === 'Overview' && <div className="cw-stack"><div className="cw-stats">{[['Consignments', data.shipments.length], ['Open incidents', data.incidents.filter(i => ['reported', 'confirmed'].includes(i.status)).length], ['Pending requests', (user.role === 'port' ? [...data.port_requests, ...data.docking_requests] : user.role === 'logistics' ? data.requests : [...data.requests, ...data.docking_requests]).filter(r => r.status === 'pending').length], ['Unread updates', unread]].map(([label, count]) => <article key={label}><small>{label}</small><strong>{count}</strong></article>)}</div><Capacity {...props} /><section className="cw-card"><h2>Transport overview</h2><ControlTowerMap data={data} /><p className="cw-muted">Reported or seeded positions. No automatic GPS/AIS feed is connected.</p></section><Weather port={data.port} token={token} /></div>}
        {tab === 'Consignments' && <Cargo {...props} />}{tab === 'Requests' && <Requests {...props} />}{tab === 'Incidents' && <Incidents {...props} />}{tab === 'Notifications' && <Alerts {...props} />}{tab === 'Tracking' && <Tracking {...props} />}{tab === 'Vessel operations' && <VesselOperations {...props} />}{tab === 'Weather' && <Weather port={data.port} token={token} />}{tab === 'Simulation' && <Simulation mutate={mutate} />}
        {tab === 'Audit trail' && <section className="cw-card"><h2>Operational history</h2><div className="cw-table"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th></tr></thead><tbody>{[...(data.audit || [])].reverse().map((a, i) => <tr key={i}><td>{stamp(a.created_at)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.record_id}</td></tr>)}</tbody></table></div>{!data.audit?.length && <p>No actions recorded.</p>}</section>}
      </>}
      <footer className="cw-footer">CoastWatch · Shared information. Clearly assigned decisions.</footer></div></main></div>
}

export default function Workspace({ role }) {
  const auth = useAuth()
  if (auth.loading) return <main className="cw-loading">Checking your session…</main>
  if (!auth.user) return <Navigate to="/" replace />
  if (!roles[auth.user.role]) return <main className="cw-loading">Your account has an unsupported role. Contact your administrator.</main>
  if (auth.user.role !== role) return <Navigate to={`/${auth.user.role}`} replace />
  return <Dashboard key={auth.user.id} {...auth} />
}

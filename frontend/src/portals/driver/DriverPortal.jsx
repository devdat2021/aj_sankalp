import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Anchor, Navigation, Bell, TriangleAlert, Truck, GitBranch, ChevronRight, MapPin, X } from 'lucide-react'
import Modal from './components/Modal'
import ShipmentCard from './components/ShipmentCard'
import NavigationMap from './components/NavigationMap'
import RouteAlternatives from './components/RouteAlternatives'
import IncidentModal from './components/IncidentModal'
import DistressButton from './components/DistressButton'
import AlertsPanel from './components/AlertsPanel'
import { createDriverApi, driverShipment } from './services/driverApi'
import { useAuth } from '../../components/AuthContext'
import { api } from '../../services/api'
import { ActionButton, ActionForm, Field } from '../../components/Forms'
import { stamp } from '../../services/format'
import Weather from '../../components/Weather'
import Intelligence from '../../components/Intelligence'
import { Tracking } from '../../components/Operations'
import { allowDemo } from '../../services/auth'
import { getRoutes, findConflicts, buildHazardZones } from './services/routing'
import './driver.css'

export default function DriverPortal({ workSession } = {}) {
  const auth = useAuth() || {}
  const token = workSession?.token || auth.token || (allowDemo ? sessionStorage.getItem('coastwatch.demo') || 'local-driver-demo' : '')
  const user = workSession?.user || auth.user || { name: 'Arjun Kumar', role: 'driver', asset_id: 'TRK-101', id: 'driver-demo' }
  const logout = auth.logout || (() => {})
  const driverApi = useMemo(() => createDriverApi(token), [token])
  const [data, setData] = useState(null)
  const [shipmentId, setShipmentId] = useState('')
  const [routes, setRoutes] = useState([])
  const [allBlocked, setAllBlocked] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [preview, setPreview] = useState(null)
  const [notice, setNotice] = useState('Loading road alternatives…')
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [pending, setPending] = useState(false)
  const [pendingAlert, setPendingAlert] = useState(null)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [panel, openPanel] = useState(null)
  const autoLoadedForRef = useRef('')
  const prevReqStatusesRef = useRef(new Map())

  const demo = token.startsWith('local-')
  const raw = data?.shipments.find(s => s.id === shipmentId) || data?.shipments[0]
  const shipment = raw ? driverShipment(raw, data, user, demo) : null
  const temperature = raw?.temperature
  const activeId = raw?.route?.points?.length ? raw.route.id || raw.route_id : ''
  const activeZones = useMemo(() => buildHazardZones(data?.incidents || [], demo), [data?.incidents, demo])
  const alerts = (data?.alerts || []).map(a => ({ ...a, title: a.message, category: 'Operations', acknowledged: a.read_by.includes(user.id) }))
  const routeRequests = useMemo(() => (data?.requests || []).filter(r => r.shipment_id === raw?.id), [data?.requests, raw?.id])
  const latestRequest = routeRequests[routeRequests.length - 1] || null
  const waiting = routeRequests.some(r => r.status === 'pending')
  const approvedRoute = raw?.route?.points
    ? { ...raw.route, id: activeId, conflicts: findConflicts(raw.route.points, activeZones), source: raw.route.source || 'Logistics approved route' }
    : null
  const displayRoutes = approvedRoute ? [approvedRoute, ...routes.filter(r => r.id !== approvedRoute.id)] : routes

  const refresh = useCallback(async () => {
    try {
      const next = await driverApi.getDashboard()
      setData(next)
      setError('')
    } catch (err) {
      if (workSession && [401, 403].includes(err.status)) { setData(null); setIncidentOpen(false) }
      setError(err.message)
    }
  }, [driverApi, workSession])

  useEffect(() => {
    const initial = setTimeout(refresh, 0)
    const timer = setInterval(() => { if (!document.hidden) refresh() }, 4000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [refresh])

  // Detect live logistics approval/rejection transitions during polling
  useEffect(() => {
    if (!routeRequests.length) return
    const prev = prevReqStatusesRef.current
    for (const r of routeRequests) {
      const oldStatus = prev.get(r.id)
      if (oldStatus === 'pending' && r.status === 'approved') {
        setMessage(`Reroute approved by logistics! New route assigned: ${raw?.route?.name || r.option_id}.`)
      } else if (oldStatus === 'pending' && r.status === 'rejected') {
        setError(`Reroute rejected by logistics: ${r.decision_reason || 'No reason provided'}`)
      }
      prev.set(r.id, r.status)
    }
  }, [routeRequests, raw?.route?.name])

  const loadRoutesFor = useCallback(async (targetShipment, incidentsList, silent = false) => {
    if (!targetShipment?.dropoff) {
      setRoutes([])
      setAllBlocked(false)
      setNotice('Destination coordinates unavailable. Request route instructions from logistics.')
      return
    }
    setLoadingRoutes(true)
    try {
      const result = await getRoutes(targetShipment, incidentsList, demo)
      setRoutes(result.routes)
      setAllBlocked(result.allBlocked)
      setNotice(result.notice)
      setSelectedId(result.safeRoutes[0]?.id || result.routes[0]?.id || '')
      if (!silent) {
        setMessage('Route alternatives updated from current position.')
      }
    } catch (err) {
      setNotice('Unable to calculate road routes.')
      if (!silent) setError(err.message)
    } finally {
      setLoadingRoutes(false)
    }
  }, [demo])

  // Auto-load route alternatives when a shipment is first opened or its active incidents change
  useEffect(() => {
    if (!raw?.id || !shipment?.dropoff) return
    const incKey = `${raw.id}:${(data?.incidents || []).length}:${shipment.location.join(',')}`
    if (autoLoadedForRef.current === incKey) return
    autoLoadedForRef.current = incKey
    loadRoutesFor(shipment, data?.incidents || [], true)
  }, [raw?.id, shipment, data?.incidents, loadRoutesFor])

  async function mutate(path, method, body) {
    const result = await api(path, token, method, body)
    await refresh()
    return result
  }

  async function refreshRoutes() {
    if (!shipment?.dropoff) { setError('Destination coordinates are not available for this consignment. Request route instructions from logistics.'); return }
    await loadRoutesFor(shipment, data?.incidents || [], false)
  }

  async function requestReroute(route) {
    setPending(true)
    setError('')
    try {
      const safeAlts = routes.filter(r => r.safe)
      await driverApi.requestReroute(route, shipment, approvedRoute, safeAlts)
      await refresh()
      setMessage('Rerouting request submitted. Awaiting logistics approval.')
    } catch (err) {
      setError(err.message)
    } finally {
      setPending(false)
    }
  }

  async function acknowledge(id) {
    setPendingAlert(id)
    try { await driverApi.acknowledgeAlert(id); await refresh() } catch (err) { setError(err.message) }
    finally { setPendingAlert(null) }
  }

  function reported(incident) {
    setMessage(`${incident.type} saved · ${incident.id}. Relevant operators have been notified. No emergency service contacted.`)
    autoLoadedForRef.current = ''
    refresh()
  }

  const active = displayRoutes.find(route => route.id === activeId) || approvedRoute
  const previewRoute = preview?.shipment === raw?.id && preview ? displayRoutes.find(route => route.id === preview.route && route.id !== activeId) : null
  const mapRoutes = [active, previewRoute].filter(Boolean)
  const location = shipment ? `${shipment.location[0].toFixed(4)}, ${shipment.location[1].toFixed(4)}` : ''
  const unread = alerts.filter(alert => !alert.acknowledged).length
  const criticalAlert = alerts.find(alert => alert.severity === 'critical' && !alert.acknowledged)

  return <div className="driver-portal vehicle-display">
    <header className="vehicle-header">
      <a href={workSession ? "/driver/work" : "/driver"} className="vehicle-brand"><Anchor size={22}/> CoastalWatch</a>
      <span className="vehicle-mode">Driver display</span>
      <span className="vehicle-id"><Truck size={16}/>{shipment?.vehicle || user.asset_id}</span>
      {!workSession && <ActionButton action={logout}>Sign out</ActionButton>}
    </header>
    <main className="vehicle-console">
      {!shipment ? <div className="loading" role="status"><Navigation size={28}/><h1>{data ? 'No consignment assigned' : 'Preparing your journey'}</h1><p>{error || (data ? 'Your logistics company will assign cargo here.' : 'Loading your assigned cargo…')}</p>{error && <button onClick={() => window.location.reload()}>Retry</button>}</div> : <>
        <aside className="drive-summary" aria-label="Current trip">
          <div className="drive-destination">
            <div className="drive-icon"><Navigation size={29}/></div>
            <div><small>Destination</small><h1>{shipment.destination}</h1></div>
          </div>
          <div className="drive-origin"><MapPin size={15}/>From {shipment.origin === 'Source port' ? data.port.name : shipment.origin}</div>
          {workSession && shipment.destination && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(shipment.dropoff?.join(',') || shipment.destination)}`}>Navigate to destination</a>}
          <dl className="drive-readouts">
            <div><dt>Est. arrival</dt><dd>{shipment.eta_hours != null && !shipment.hazard_stopped ? <>{shipment.eta_hours}<em>h</em></> : '—'}</dd></div>
            <div><dt>{shipment.refrigerated ? 'Cargo temp.' : 'Cargo weight'}</dt><dd>{shipment.refrigerated ? temperature == null ? '—' : <>{temperature}<em>°C</em></> : <>{raw.quantity}<em>t</em></>}</dd></div>
          </dl>
          <div className="drive-state"><strong>{shipment.status}</strong><span>{raw.route ? 'Assigned route · ' + (raw.route.name || raw.route_id) : 'No route assigned'}</span>
            {waiting && <span className="pending-note">Reroute awaiting approval</span>}
          </div>
          <nav className="drive-apps" aria-label="Trip controls">
            {[[Truck,'trip','Trip details'],[GitBranch,'routes','Routes'],[Bell,'alerts','Alerts']].map(([Icon,id,label]) =>
              <button key={id} aria-haspopup="dialog" onClick={() => openPanel(id)}><Icon size={20}/><span>{label}</span>{id === 'alerts' && unread > 0 && <b>{unread}</b>}<ChevronRight size={15}/></button>)}
          </nav>
        </aside>
        {panel && <Modal title={{trip:'Trip details',routes:'Route options',alerts:'Alerts'}[panel]} onClose={() => openPanel(null)} className="vehicle-sheet">
          <div className="driver-portal vehicle-panel">
            {panel === 'trip' && <div className="trip-section">
              <label className="field-label">Assigned consignment<select value={raw.id} onChange={e => { setShipmentId(e.target.value); setRoutes([]); setSelectedId(''); autoLoadedForRef.current = ''; }} aria-label="Assigned consignment">{data.shipments.map(s => <option key={s.id} value={s.id}>{s.cargo} · {s.id}</option>)}</select></label>
              <ShipmentCard shipment={shipment} temperature={temperature} route={active} loadingRoutes={loadingRoutes}/>

              <section className="driver-card" aria-label="Route and rerouting status">
                <div className="section-heading">
                  <h2 className="eyebrow">Route &amp; rerouting status</h2>
                  <span className={`badge ${!latestRequest ? 'neutral' : latestRequest.status === 'approved' ? 'success' : latestRequest.status === 'rejected' ? 'danger' : latestRequest.status === 'pending' ? 'pending' : 'neutral'}`}>
                    {!latestRequest ? 'No rerouting request' : latestRequest.status === 'pending' ? 'Awaiting logistics approval' : latestRequest.status}
                  </span>
                </div>
                <p><strong>Currently approved route:</strong> {raw.route?.name || 'Not assigned'}</p>
                {raw.route?.distance && (
                  <p className="muted">Distance: {(raw.route.distance / 1000).toFixed(1)} km · Est. {Math.round((raw.route.duration || 0) / 60)} min</p>
                )}
                {latestRequest && (
                  <div style={{ marginTop: 8 }}>
                    <p><strong>Requested alternative:</strong> {latestRequest.options?.[0]?.name || 'Custom route'}</p>
                    <p className="muted">Submitted: {stamp(latestRequest.created_at)}</p>
                    {latestRequest.reviewed_at && <p className="muted">Reviewed: {stamp(latestRequest.reviewed_at)}</p>}
                    {latestRequest.decision_reason && <p><strong>Logistics decision:</strong> {latestRequest.decision_reason}</p>}
                    {latestRequest.superseded_reason && <p className="route-risk">{latestRequest.superseded_reason}</p>}
                    {latestRequest.reported_restrictions?.length > 0 && (
                      <p className="route-risk">Restrictions: {latestRequest.reported_restrictions.join(' · ')}</p>
                    )}
                    <ol className="request-timeline" aria-label="Rerouting progress">
                      <li>Request submitted</li>
                      <li>{latestRequest.status === 'pending' ? 'Awaiting logistics review' : latestRequest.status === 'approved' ? 'Approved by logistics' : latestRequest.status === 'rejected' ? 'Rejected by logistics' : latestRequest.status}</li>
                      {latestRequest.status === 'approved' && latestRequest.option_id === activeId && <li>New route assigned</li>}
                    </ol>
                  </div>
                )}
              </section>

              {['ready_for_pickup','in_transit'].includes(raw.status) && (
                <ActionButton
                  disabled={shipment.hazard_stopped || (raw.status==='ready_for_pickup' && !data.port_requests.some(r=>r.shipment_id===raw.id && r.kind==='truck_access' && r.status==='approved' && r.truck_id===raw.truck_id))}
                  action={()=>mutate(`/shipments/${raw.id}/events`,'POST',{event:raw.status==='ready_for_pickup'?'picked_up':'delivered'})}
                >
                  {shipment.hazard_stopped ? 'Halted: Hazard Reported' : (raw.status==='ready_for_pickup'?'Confirm pickup':'Confirm delivery')}
                </ActionButton>
              )}
              {shipment.hazard_stopped && (
                <p className="hazard-warning-inline" style={{ color: '#ef4444', fontWeight: 600, marginTop: '8px' }}>
                  ⚠️ Route progression stopped. Driver safety priority: never proceed into reported hazards. Request logistics reroute approval before continuing.
                </p>
              )}
              <details><summary>Port access slots</summary>{data.port_requests.filter(r=>r.shipment_id===raw.id).map(r=><p key={r.id}>{r.kind.replaceAll('_',' ')}: {r.status} · {stamp(r.slot || r.requested_at)}</p>)}</details>
              <details><summary>Movement history</summary>{(raw.history || raw.events)?.map(e=><p key={e.id}>{e.event} · {stamp(e.created_at)}{e.details?.reason && ` · ${e.details.reason}`}</p>)}</details>
              <details><summary>Update truck location</summary><div className="workflow-content"><Tracking data={{...data,vessels:[]}} user={user} mutate={mutate}/></div></details>
              {!workSession && <details><summary>Port weather</summary><div className="workflow-content"><Weather port={data.port} token={token}/></div></details>}
            </div>}

            {panel === 'routes' && <div className="routes-section">
              <p className="panel-notice" role="status">{notice}</p>
              <button onClick={refreshRoutes} disabled={loadingRoutes}>{loadingRoutes ? 'Recalculating…' : 'Recalculate road alternatives'}</button>
              <RouteAlternatives
                routes={displayRoutes}
                activeId={activeId}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onPreview={route => { setPreview({ shipment: raw.id, route: route.id }); openPanel(null) }}
                onRequest={requestReroute}
                pending={pending}
                waiting={waiting}
                loadingRoutes={loadingRoutes}
                allBlocked={allBlocked}
              />
              {workSession && !routes.length && !waiting && <ActionForm label="Request route review" submit={f => mutate('/route-requests','POST',{
                shipment_id: raw.id, reason: f.reason, options: [{id: crypto.randomUUID(), name: f.instructions, delay_hours: Number(f.delay)}]
              })}>
                <Field name="reason" label="Reason for rerouting" minLength={3} maxLength={1000}/>
                <Field name="instructions" label="Proposed route instructions"/>
                <Field name="delay" label="Estimated additional hours" type="number" min="0" step="any" value={0}/>
              </ActionForm>}
              {waiting && (
                <p className="muted" role="status"><strong>Rerouting request submitted. Awaiting logistics approval.</strong></p>
              )}
              {!raw.route?.points && raw.route && <p>Approved instructions have no map geometry.</p>}
            </div>}

            {panel === 'alerts' && <div className="alerts-section">
              {!workSession && <Intelligence token={token} user={user} shipments={data?.shipments || []}/>}
              <AlertsPanel alerts={alerts} onAcknowledge={acknowledge} pendingId={pendingAlert}/>
              <details><summary>Incident reports</summary>{data.incidents.map(i=><p key={i.id}>{i.category}: {i.description} · {i.status}</p>)}</details>
            </div>}
          </div>
        </Modal>}
        <section className="drive-map" aria-label="Shipment navigation">
          {shipment.hazard_stopped && (
            <div className="critical-banner hazard-stopped-alert"  role="alert">
              <span className="critical-icon"><TriangleAlert size={21}/></span>
              <div>
                <strong>Trip halted</strong>
                <p>{shipment.hazard_reason || 'Unsafe hazard condition reported.'}</p>
              </div>
              <button onClick={() => openPanel('routes')}>Request Reroute</button>
            </div>
          )}
          {criticalAlert && !shipment.hazard_stopped && <div className="critical-banner"><span className="critical-icon"><TriangleAlert size={21}/></span><div><strong>{criticalAlert.title}</strong><p>Operational warning · review route options</p></div><button onClick={() => openPanel('routes')}>View routes</button><button className="acknowledge-critical" disabled={pendingAlert !== null} onClick={() => acknowledge(criticalAlert.id)}>{pendingAlert === criticalAlert.id ? 'Updating…' : 'Acknowledge'}</button></div>}
          {previewRoute && <div className="preview-notice"><span>Preview · {previewRoute.name}</span><button onClick={() => setPreview(null)}>End preview</button></div>}

          <NavigationMap shipment={shipment} zones={activeZones} requested={latestRequest?.status === 'pending' ? latestRequest.options?.[0] : null} routes={mapRoutes} activeId={activeId} selectedId={previewRoute?.id}/>
        </section>
        <footer className="drive-toolbar">
          <span className="drive-position"><span className="position-dot"/>{demo ? 'Demo position' : 'Reported position'} <strong>{location}</strong></span>
          {!shipment.hazard_stopped && <button className="hazard-action" onClick={() => setIncidentOpen(true)}><TriangleAlert size={18}/> Report hazard or delay</button>}
          <DistressButton driverApi={driverApi} shipment={shipment} location={location} onReported={reported}/>
        </footer>
      </>}
      {(message || error) && <div className={`status-message ${error ? 'error-message' : ''}`} role="status"><span>{error || message}</span><button aria-label="Dismiss notification" onClick={() => { setMessage(''); setError('') }}><X size={18}/></button></div>}
    </main>
    {incidentOpen && <IncidentModal driverApi={driverApi} shipment={shipment} location={location} onClose={() => setIncidentOpen(false)} onReported={reported}/>}
  </div>
}

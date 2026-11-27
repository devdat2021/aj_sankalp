import { useCallback, useEffect, useMemo, useState } from 'react'
import { Anchor, Navigation, Bell, TriangleAlert, Truck, RefreshCw, GitBranch, ChevronUp, ChevronDown, X } from 'lucide-react'
import ShipmentCard from './components/ShipmentCard'
import NavigationMap from './components/NavigationMap'
import RouteAlternatives from './components/RouteAlternatives'
import IncidentModal from './components/IncidentModal'
import DistressButton from './components/DistressButton'
import AlertsPanel from './components/AlertsPanel'
import { createDriverApi, driverShipment } from './services/driverApi'
import { useAuth } from '../../components/AuthContext'
import { api } from '../../services/api'
import { ActionButton } from '../../components/Forms'
import { stamp } from '../../services/format'
import Weather from '../../components/Weather'
import { Tracking } from '../../components/Operations'
import { allowDemo } from '../../services/auth'
import { getRoutes, findConflicts } from './services/routing'
import './driver.css'

export default function DriverPortal() {
  const auth = useAuth() || {}
  const token = auth.token || (allowDemo ? sessionStorage.getItem('coastwatch.demo') || 'local-driver-demo' : '')
  const user = auth.user || { name: 'Arjun Kumar', role: 'driver', asset_id: 'TRK-101', id: 'driver-demo' }
  const logout = auth.logout || (() => {})
  const driverApi = useMemo(() => createDriverApi(token), [token])
  const [data, setData] = useState(null)
  const [shipmentId, setShipmentId] = useState('')
  const [routes, setRoutes] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Select a consignment to preview road options.')
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [pending, setPending] = useState(false)
  const [pendingAlert, setPendingAlert] = useState(null)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [panel, setPanel] = useState('trip')
  const [sheetExpanded, setSheetExpanded] = useState(false)

  function openPanel(nextPanel) {
    setPanel(nextPanel)
    setSheetExpanded(true)
  }
  const raw = data?.shipments.find(s => s.id === shipmentId) || data?.shipments[0]
  const shipment = raw ? driverShipment(raw, data, user) : null
  const temperature = raw?.temperature ?? 0
  const activeId = raw?.route_id || ''
  const alerts = (data?.alerts || []).map(a => ({ ...a, title: a.message, category: 'Operations', acknowledged: a.read_by.includes(user.id) }))
  const routeRequests = (data?.requests || []).filter(r => r.shipment_id === raw?.id)
  const waiting = routeRequests.some(r => r.status === 'pending')
  const approvedRoute = raw?.route?.points ? { ...raw.route, conflicts: findConflicts(raw.route.points), source: raw.route.source || 'Operator supplied route' } : null
  const displayRoutes = approvedRoute ? [approvedRoute, ...routes.filter(r => r.id !== approvedRoute.id)] : routes
  const refresh = useCallback(async () => {
    try { setData(await driverApi.getDashboard()); setError('') } catch (err) { setError(err.message) }
  }, [driverApi])
  useEffect(() => {
    const initial = setTimeout(refresh, 0)
    const timer = setInterval(() => { if (!document.hidden) refresh() }, 8000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [refresh])
  async function mutate(path, method, body) {
    const result = await api(path, token, method, body)
    await refresh()
    return result
  }
  async function refreshRoutes() {
    if (!shipment?.dropoff) { setError('Destination coordinates are not available for this consignment. Request route instructions from logistics.'); return }
    setLoadingRoutes(true)
    try {
      const result = await getRoutes(shipment)
      setRoutes(result.routes); setNotice(result.notice)
      setSelectedId(result.routes[0]?.id || '')
      setMessage('Route previews refreshed. The logistics-approved route remains unchanged.')
    } catch (err) { setError(err.message) }
    finally { setLoadingRoutes(false) }
  }
  async function requestReroute(route) {
    setPending(true)
    try { await driverApi.requestReroute(route, shipment, approvedRoute); await refresh(); setMessage('Reroute request saved. Awaiting logistics company approval.') }
    catch (err) { setError(err.message) }
    finally { setPending(false) }
  }
  async function acknowledge(id) {
    setPendingAlert(id)
    try { await driverApi.acknowledgeAlert(id); await refresh() } catch (err) { setError(err.message) }
    finally { setPendingAlert(null) }
  }
  function reported(incident) {
    setMessage(`${incident.type} saved · ${incident.id}. Relevant operators have been notified. No emergency service contacted.`)
    refresh()
  }
  const active = displayRoutes.find(route => route.id === activeId)
  const location = shipment ? `${shipment.location[0].toFixed(4)}, ${shipment.location[1].toFixed(4)}` : ''
  const unread = alerts.filter(alert => !alert.acknowledged).length
  const criticalAlert = alerts.find(alert => alert.severity === 'critical' && !alert.acknowledged)
  return <div className="driver-portal">
    <header className="cockpit-header">
      <a className="brand" href="/driver" aria-label="CoastWatch driver home"><span className="brand-icon"><Anchor size={25}/></span><span>CoastWatch<span className="brand-sub">SUPPLY CHAIN MANAGEMENT</span></span></a>
      <div className="workspace-label"><Navigation size={16}/> Driver workspace</div>
      <div className="header-right"><span className="demo-badge"><i/> SHARED OPERATIONS</span><div className="driver-profile"><span><strong>{user.name}</strong><small>{shipment?.vehicle || user.asset_id}</small></span><ActionButton action={logout}>Sign out</ActionButton></div></div>
    </header>
    <div className="demo-ribbon">Assigned cargo and decisions are saved. Positions are seeded or manually reported. <strong>SOS is not an emergency service.</strong></div>
    <main className="cockpit-body">
      {!shipment ? <div className="loading" role="status"><Navigation size={28}/><h1>{data ? 'No consignment assigned' : 'Preparing your journey'}</h1><p>{error || (data ? 'Your logistics company will assign cargo here.' : 'Loading your assigned cargo…')}</p>{error && <button onClick={() => window.location.reload()}>Retry</button>}</div> : <>
        <aside className={`trip-rail ${sheetExpanded ? 'expanded' : ''}`} data-panel={panel} aria-label="Trip information">
          <button className="sheet-toggle" aria-expanded={sheetExpanded} aria-controls="trip-panel-content" onClick={() => setSheetExpanded(value => !value)}>
            <span><strong>{shipment.destination}</strong><small>{active ? `${Math.round(active.duration / 60)} min · ${(active.distance / 1000).toFixed(1)} km` : 'Route instructions from logistics'} <span>· {temperature.toFixed(1)}°C</span></small></span>
            {sheetExpanded ? <ChevronDown size={22}/> : <ChevronUp size={22}/>}
          </button>
          <nav className="rail-tabs" aria-label="Trip panels">
            <button aria-pressed={panel === 'trip'} onClick={() => openPanel('trip')}><Truck size={17}/><span>Trip</span></button>
            <button aria-pressed={panel === 'routes'} onClick={() => openPanel('routes')}><GitBranch size={17}/><span>Routes</span></button>
            <button aria-pressed={panel === 'alerts'} onClick={() => openPanel('alerts')}><Bell size={17}/><span>Alerts</span><span className="unread-count">{unread}</span></button>
          </nav>
          <div className="rail-content" id="trip-panel-content">
            <div className="trip-section">
              <label className="field-label">Assigned consignment<select value={raw.id} onChange={e => { setShipmentId(e.target.value); setRoutes([]); setSelectedId(''); }} aria-label="Assigned consignment">{data.shipments.map(s => <option key={s.id} value={s.id}>{s.cargo} · {s.id}</option>)}</select></label>
              <ShipmentCard shipment={shipment} temperature={temperature} route={active}/>
              <p>Approved route: {raw.route?.name || 'Not assigned'}</p>
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
              <details><summary>Port access slots</summary>{data.port_requests.filter(r=>r.shipment_id===raw.id).map(r=><p key={r.id}>{r.kind.replaceAll('_',' ')}: {r.status} · {stamp(r.slot || r.requested_at)}</p>)}</details><details><summary>Movement history</summary>{(raw.history || raw.events)?.map(e=><p key={e.id}>{e.event} · {stamp(e.created_at)}{e.details?.reason && ` · ${e.details.reason}`}</p>)}</details>
              <details><summary>Update truck location</summary><div className="workflow-content"><Tracking data={{...data,vessels:[]}} user={user} mutate={mutate}/></div></details>
              <details><summary>Port weather</summary><div className="workflow-content"><Weather port={data.port} token={token}/></div></details>
            </div>
            <div className="routes-section"><button onClick={refreshRoutes} disabled={loadingRoutes}>Load road alternatives</button><RouteAlternatives routes={displayRoutes} activeId={activeId} selectedId={selectedId} onSelect={setSelectedId} onRequest={requestReroute} pending={pending || loadingRoutes || waiting || raw.status === 'delivered'}/>{routeRequests.map(r=><p key={r.id}>Reroute: <strong>{r.status}</strong> · {r.reason}{r.decision_reason && ` · Decision: ${r.decision_reason}`}{r.superseded_reason && ` · ${r.superseded_reason}`}</p>)}<p>{!raw.route?.points && raw.route ? 'Approved instructions have no map geometry.' : ''}</p></div>
            <div className="alerts-section"><AlertsPanel alerts={alerts} onAcknowledge={acknowledge} pendingId={pendingAlert}/><details><summary>Incident reports</summary>{data.incidents.map(i=><p key={i.id}>{i.category}: {i.description} · {i.status}</p>)}</details></div>
          </div>
          <div className="rail-footnote"><span className="online-dot"/> Karnataka coastal corridor <span>Demo / 01</span></div>
        </aside>
        <section className="navigation-stage" aria-label="Shipment navigation">
          <div className="map-heading"><div><span className="eyebrow">ON THE ROAD</span><h1>{data.port.name} <span>→</span> {shipment.destination}</h1></div><button className="icon-button" onClick={refreshRoutes} disabled={loadingRoutes || pending} aria-label="Refresh road routes"><RefreshCw size={19}/></button></div>
          {shipment.hazard_stopped && (
            <div className="critical-banner hazard-stopped-alert" style={{ background: '#7f1d1d', border: '1px solid #ef4444' }} role="alert">
              <span className="critical-icon"><TriangleAlert size={21}/></span>
              <div>
                <strong>STOPPED / UNABLE TO CONTINUE</strong>
                <p>{shipment.hazard_reason || 'Unsafe hazard condition reported.'} Progression halted for driver safety. Awaiting approved reroute.</p>
              </div>
              <button onClick={() => openPanel('routes')}>Request Reroute</button>
            </div>
          )}
          {criticalAlert && !shipment.hazard_stopped && <div className="critical-banner"><span className="critical-icon"><TriangleAlert size={21}/></span><div><strong>{criticalAlert.title}</strong><p>Operational warning · review route options</p></div><button onClick={() => openPanel('routes')}>View routes</button><button className="acknowledge-critical" disabled={pendingAlert !== null} onClick={() => acknowledge(criticalAlert.id)}>{pendingAlert === criticalAlert.id ? 'Updating…' : 'Acknowledge'}</button></div>}
          <NavigationMap shipment={{...shipment,dropoff:shipment.dropoff || shipment.location}} routes={displayRoutes} activeId={activeId} selectedId={selectedId}/>
          <div className="map-source"><span className="source-dot"/><p role="status">{loadingRoutes ? 'Updating routes…' : notice}</p></div>
        </section>
        <div className="cockpit-actions">
          <span className="position-label"><span className="online-dot"/> Reported / seeded position <strong>{location}</strong></span>
          {shipment.hazard_stopped ? (
            <span style={{ background: '#dc2626', color: '#fff', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <TriangleAlert size={18}/> STOPPED / UNABLE TO CONTINUE
            </span>
          ) : (
            <button className="report-button" style={{ background: '#c2410c' }} onClick={() => setIncidentOpen(true)}>
              <TriangleAlert size={19}/> Report Hazard & Stop
            </button>
          )}
          <DistressButton driverApi={driverApi} shipment={shipment} location={location} onReported={reported}/>
        </div>
      </>}
      {(message || error) && <div className={`status-message ${error ? 'error-message' : ''}`} role="status"><span>{error || message}</span><button aria-label="Dismiss notification" onClick={() => { setMessage(''); setError('') }}><X size={18}/></button></div>}
    </main>
    {incidentOpen && <IncidentModal driverApi={driverApi} shipment={shipment} location={location} onClose={() => setIncidentOpen(false)} onReported={reported}/>}
  </div>
}

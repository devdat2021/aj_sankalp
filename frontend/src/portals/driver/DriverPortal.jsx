import { useEffect, useState } from 'react'
import { Anchor, Navigation, Bell, TriangleAlert, Truck, RefreshCw, GitBranch, ChevronUp, ChevronDown, X } from 'lucide-react'
import ShipmentCard from './components/ShipmentCard'
import NavigationMap from './components/NavigationMap'
import RouteAlternatives from './components/RouteAlternatives'
import IncidentModal from './components/IncidentModal'
import DistressButton from './components/DistressButton'
import AlertsPanel from './components/AlertsPanel'
import { driverApi } from './services/driverApi'
import { getRoutes } from './services/routing'
import './driver.css'

export default function DriverPortal() {
  const [shipment, setShipment] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [routes, setRoutes] = useState([])
  const [activeId, setActiveId] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [notice, setNotice] = useState('Fetching road routes…')
  const [loadingRoutes, setLoadingRoutes] = useState(true)
  const [pending, setPending] = useState(false)
  const [pendingAlert, setPendingAlert] = useState(null)
  const [incidentOpen, setIncidentOpen] = useState(false)
  const [temperature, setTemperature] = useState(2.4)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [panel, setPanel] = useState('trip')
  const [sheetExpanded, setSheetExpanded] = useState(false)

  function openPanel(nextPanel) {
    setPanel(nextPanel)
    setSheetExpanded(true)
  }
  useEffect(() => {
    let cancelled = false
    Promise.all([driverApi.getShipment(), driverApi.getAlerts(), getRoutes()]).then(([data, updates, routing]) => {
      if (cancelled) return
      setShipment(data); setAlerts(updates); setRoutes(routing.routes); setNotice(routing.notice)
      setActiveId(routing.routes[0].id); setSelectedId(routing.routes[0].id); setLoadingRoutes(false)
    }).catch(err => { if (!cancelled) setError(err.message) })
    const timer = setInterval(() => setTemperature(value => Math.max(1.8, Math.min(3.2, value + (Math.random() - 0.5) * 0.3))), 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])
  async function refreshRoutes() {
    setLoadingRoutes(true)
    try {
      const result = await getRoutes()
      setRoutes(result.routes); setNotice(result.notice)
      // A new geometry needs a new approval, so reset to the default assignment.
      setActiveId(result.routes[0].id); setSelectedId(result.routes[0].id)
      setMessage('Routes refreshed. Default assigned route restored; request approval for any alternative.')
    } catch (err) { setError(err.message) }
    finally { setLoadingRoutes(false) }
  }
  async function requestReroute(route) {
    setPending(true); setMessage('Rerouting request sent to simulated Port Authority…')
    try {
      const response = await driverApi.requestReroute(route)
      if (response.approved) setActiveId(route.id)
      setAlerts(await driverApi.getAlerts()); setMessage(response.alert.message)
    } catch (err) { setError(err.message) }
    finally { setPending(false) }
  }
  async function acknowledge(id) {
    setPendingAlert(id)
    try { setAlerts(await driverApi.acknowledgeAlert(id)) } catch (err) { setError(err.message) }
    finally { setPendingAlert(null) }
  }
  function reported(incident) {
    setMessage(`${incident.type} recorded · ${incident.id} · ${new Date(incident.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST. Simulation only; no real authority contacted.`)
  }
  const active = routes.find(route => route.id === activeId)
  const location = shipment ? `${shipment.location[0].toFixed(4)}, ${shipment.location[1].toFixed(4)} · simulated truck position` : ''
  const unread = alerts.filter(alert => !alert.acknowledged).length
  const criticalAlert = alerts.find(alert => alert.severity === 'critical' && !alert.acknowledged)
  return <div className="driver-portal">
    <header className="cockpit-header">
      <a className="brand" href="/driver" aria-label="CoastWatch driver home"><span className="brand-icon"><Anchor size={25}/></span><span>CoastWatch<span className="brand-sub">SUPPLY CHAIN MANAGEMENT</span></span></a>
      <div className="workspace-label"><Navigation size={16}/> Driver workspace</div>
      <div className="header-right"><span className="demo-badge"><i/> DEMO OPERATIONS</span><div className="driver-profile"><span><strong>Arjun Kumar</strong><small>KA 19 AB 4821</small></span><span className="avatar">AK</span></div></div>
    </header>
    <div className="demo-ribbon">Simulated shipment, location & authority responses. <strong>SOS is not an emergency service.</strong></div>
    <main className="cockpit-body">
      {!shipment ? <div className="loading" role="status"><Navigation size={28}/><h1>Preparing your journey</h1><p>{error || 'Loading shipment and road routes…'}</p>{error && <button onClick={() => window.location.reload()}>Retry</button>}</div> : <>
        <aside className={`trip-rail ${sheetExpanded ? 'expanded' : ''}`} data-panel={panel} aria-label="Trip information">
          <button className="sheet-toggle" aria-expanded={sheetExpanded} aria-controls="trip-panel-content" onClick={() => setSheetExpanded(value => !value)}>
            <span><strong>{shipment.destination}</strong><small>{active ? `${Math.round(active.duration / 60)} min · ${(active.distance / 1000).toFixed(1)} km` : 'Calculating route'} <span>· {temperature.toFixed(1)}°C</span></small></span>
            {sheetExpanded ? <ChevronDown size={22}/> : <ChevronUp size={22}/>}
          </button>
          <nav className="rail-tabs" aria-label="Trip panels">
            <button aria-pressed={panel === 'trip'} onClick={() => openPanel('trip')}><Truck size={17}/><span>Trip</span></button>
            <button aria-pressed={panel === 'routes'} onClick={() => openPanel('routes')}><GitBranch size={17}/><span>Routes</span></button>
            <button aria-pressed={panel === 'alerts'} onClick={() => openPanel('alerts')}><Bell size={17}/><span>Alerts</span><span className="unread-count">{unread}</span></button>
          </nav>
          <div className="rail-content" id="trip-panel-content">
            <div className="trip-section"><ShipmentCard shipment={shipment} temperature={temperature} route={active}/></div>
            <div className="routes-section"><RouteAlternatives routes={routes} activeId={activeId} selectedId={selectedId} onSelect={setSelectedId} onRequest={requestReroute} pending={pending || loadingRoutes}/></div>
            <div className="alerts-section"><AlertsPanel alerts={alerts} onAcknowledge={acknowledge} pendingId={pendingAlert}/></div>
          </div>
          <div className="rail-footnote"><span className="online-dot"/> Karnataka coastal corridor <span>Demo / 01</span></div>
        </aside>
        <section className="navigation-stage" aria-label="Shipment navigation">
          <div className="map-heading"><div><span className="eyebrow">ON THE ROAD</span><h1>New Mangalore Port <span>→</span> Udupi</h1></div><button className="icon-button" onClick={refreshRoutes} disabled={loadingRoutes || pending} aria-label="Refresh road routes"><RefreshCw size={19}/></button></div>
          {criticalAlert && <div className="critical-banner"><span className="critical-icon"><TriangleAlert size={21}/></span><div><strong>{criticalAlert.title}</strong><p>Simulated disruption · review route options</p></div><button onClick={() => openPanel('routes')}>View routes</button><button className="acknowledge-critical" disabled={pendingAlert !== null} onClick={() => acknowledge(criticalAlert.id)}>{pendingAlert === criticalAlert.id ? 'Updating…' : 'Acknowledge'}</button></div>}
          <NavigationMap shipment={shipment} routes={routes} activeId={activeId} selectedId={selectedId}/>
          <div className="map-source"><span className="source-dot"/><p role="status">{loadingRoutes ? 'Updating routes…' : notice}</p></div>
        </section>
        <div className="cockpit-actions"><span className="position-label"><span className="online-dot"/> Simulated truck position <strong>13.0250° N, 74.7950° E</strong></span><button className="report-button" onClick={() => setIncidentOpen(true)}><TriangleAlert size={19}/> Report incident</button><DistressButton location={location} onReported={reported}/></div>
      </>}
      {(message || error) && <div className={`status-message ${error ? 'error-message' : ''}`} role="status"><span>{error || message}</span><button aria-label="Dismiss notification" onClick={() => { setMessage(''); setError('') }}><X size={18}/></button></div>}
    </main>
    {incidentOpen && <IncidentModal location={location} onClose={() => setIncidentOpen(false)} onReported={reported}/>}
  </div>
}

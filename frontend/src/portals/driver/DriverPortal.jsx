import { useEffect, useState } from 'react'
import { Anchor, Navigation, Bell, TriangleAlert, Truck, RefreshCw, ArrowUpRight } from 'lucide-react'
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
  return <div className="driver-portal">
    <aside className="driver-sidebar"><a className="brand" href="/driver"><span className="brand-icon"><Anchor size={24}/></span><span>CoastWatch<span className="brand-sub">SUPPLY CHAIN MANAGEMENT</span></span></a><div className="portal-label">DRIVER WORKSPACE</div><nav aria-label="Driver navigation"><a className="nav-active" href="#overview"><Truck size={19}/> Trip overview</a><a href="#navigation"><Navigation size={19}/> Navigation</a><a href="#alerts"><Bell size={19}/> Alerts <span className="nav-count">{alerts.filter(a => !a.acknowledged).length}</span></a><button onClick={() => setIncidentOpen(true)} disabled={!shipment}><TriangleAlert size={19}/> Report incident</button></nav><div className="sidebar-bottom"><span className="online-dot"/> Demo operations online<p>Coastal corridor · Karnataka</p><div className="driver-profile"><span className="avatar">AK</span><div><strong>Arjun Kumar</strong><small>Truck driver · KA 19 AB 4821</small></div></div></div></aside>
    <div className="driver-workspace"><header className="driver-header"><span>Driver portal <span className="header-divider">/</span> <strong>Trip overview</strong></span><span className="badge neutral">DEMO ENVIRONMENT</span></header>
      <main id="overview" className="driver-main"><div className="page-heading"><div><span className="eyebrow">YOUR JOURNEY, CONNECTED</span><h1>Let’s keep things moving.</h1><p className="muted">Your shipment, route and operations updates in one place.</p></div><DistressButton location={location} onReported={reported}/></div>
        <div className="demo-strip"><span className="online-dot"/> Standalone demo <span>Shipment, location, sensors and authority responses are simulated. SOS is not an emergency service.</span></div>
        {message && <div className="status-message" role="status">{message}<button aria-label="Dismiss notification" onClick={() => setMessage('')}>×</button></div>}
        {error && <p role="alert" className="error-message">{error}</p>}
        {!shipment ? <div className="driver-card loading" role="status">{error ? 'Unable to load demo. Reload the page to retry.' : 'Preparing your shipment and road routes…'}</div> : <>
          <div className="overview-grid"><div className="shipment-column"><ShipmentCard shipment={shipment} temperature={temperature} route={active}/><section className="support-card"><TriangleAlert size={21}/><h3>Something on the road?</h3><p>Keep operations informed of delays or cargo issues.</p><button onClick={() => setIncidentOpen(true)}>Report an incident<ArrowUpRight size={17}/></button></section></div>
            <section className="driver-card navigation-card" id="navigation"><div className="section-heading"><div><h2><Navigation size={18}/> Live route overview</h2><p className="muted">New Mangalore Port <span aria-hidden="true">→</span> Udupi</p></div><button className="icon-button" onClick={refreshRoutes} disabled={loadingRoutes || pending} aria-label="Refresh road routes"><RefreshCw size={18}/></button></div>
              <div className="disruption-banner"><TriangleAlert size={19}/><div><strong>Flooding on the coastal corridor</strong><span>Simulated incident near Mulki. Review route options.</span></div><a href="#routes">View routes →</a></div>
              <NavigationMap shipment={shipment} routes={routes} activeId={activeId} selectedId={selectedId}/><p className="routing-notice" role="status">{loadingRoutes ? 'Updating routes…' : notice}</p>
            </section></div>
          <RouteAlternatives routes={routes} activeId={activeId} selectedId={selectedId} onSelect={setSelectedId} onRequest={requestReroute} pending={pending || loadingRoutes}/>
          <AlertsPanel alerts={alerts} onAcknowledge={acknowledge} pendingId={pendingAlert}/>
        </>}
        <footer className="driver-footer">CoastWatch-SCM <span>Driver operations · Prototype / 01</span></footer>
      </main>
    </div>{incidentOpen && <IncidentModal location={location} onClose={() => setIncidentOpen(false)} onReported={reported}/>}
  </div>
}

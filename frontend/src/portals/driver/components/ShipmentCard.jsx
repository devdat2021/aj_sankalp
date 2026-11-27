import { Package, Thermometer, MapPin } from 'lucide-react'


export default function ShipmentCard({ shipment, temperature, route, loadingRoutes }) {
  const hasLimit = temperature != null && shipment.max_temperature != null
  const isStopped = Boolean(shipment.hazard_stopped || shipment.status === 'Stopped / Unable to continue')
  const eta = isStopped
    ? 'HALTED · Hazard stopped'
    : shipment.eta_hours != null ? `~${shipment.eta_hours} h` : loadingRoutes ? 'Calculating…' : 'Unavailable'

  return <section className={`driver-card shipment-card ${isStopped ? 'card-hazard-stopped' : ''}`}>
    <div className="section-heading"><h2 className="eyebrow">Trip manifest</h2><span className={`badge ${isStopped ? 'danger' : 'success'}`}>● {isStopped ? 'STOPPED / UNABLE TO CONTINUE' : shipment.status}</span></div>
    {isStopped && <div className="hazard-banner-inline"><strong>⚠️ Vehicle Halted for Safety</strong><p>{shipment.hazard_reason || 'Unsafe hazard condition reported. Route progression halted.'}</p></div>}
    <div className="destination-heading"><span className="field-label"><MapPin size={14}/> DESTINATION</span><h2>{shipment.destination}</h2></div>
    <div className="shipment-metrics"><div><small>EST. ARRIVAL</small><strong className={isStopped ? 'text-danger' : ''}>{eta}</strong></div><div><small>REMAINING</small><strong>{route ? `${(route.distance / 1000).toFixed(1)} km` : '—'}</strong></div></div>
    {shipment.refrigerated && <div className="temperature"><Thermometer size={23}/><div><strong>{temperature == null ? "Unavailable" : temperature.toFixed(1) + "°C"} <span className={`badge ${!hasLimit ? 'neutral' : temperature <= shipment.max_temperature ? 'success' : 'danger'}`}>{!hasLimit ? 'Unassessed' : temperature <= shipment.max_temperature ? 'Within limit' : 'Above limit'}</span></strong><p>Reported temperature · {shipment.max_temperature == null ? "limit unavailable" : "maximum " + shipment.max_temperature + "°C"}</p></div></div>}
    <div className="journey"><span className="stop-dot"/><div><span className="field-label">PICKUP</span><strong>{shipment.origin}</strong></div></div>
    {shipment.access_slot && <div className="journey"><span className="stop-dot"/><div><span className="field-label">PORT ACCESS SLOT</span><strong>{new Date(shipment.access_slot).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST · Approved</strong></div></div>}
    <div className="cargo-details"><Package size={20}/><div><strong>{shipment.id}</strong><p>{shipment.cargo} · {shipment.weight}</p><small>{shipment.refrigerated ? 'Refrigerated cargo' : 'Standard cargo'}</small></div></div>
    <p className="fine-print">{isStopped ? 'Route progression blocked until safe detour is approved by logistics.' : 'Estimated from the simulated position. No live traffic.'}</p>
  </section>
}

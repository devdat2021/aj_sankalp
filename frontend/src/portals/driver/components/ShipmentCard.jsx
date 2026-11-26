import { Package, Thermometer, MapPin } from 'lucide-react'
import { useState } from 'react'
export default function ShipmentCard({ shipment, temperature, route }) {
  const [departureTime] = useState(() => Date.now())
  const eta = route ? new Date(departureTime + route.duration * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'Calculating…'
  return <section className="driver-card shipment-card">
    <div className="section-heading"><h2 className="eyebrow">Trip manifest</h2><span className="badge success">● {shipment.status}</span></div>
    <div className="destination-heading"><span className="field-label"><MapPin size={14}/> DESTINATION</span><h2>{shipment.destination}</h2><p className="muted">Udupi, Karnataka · demo facility</p></div>
    <div className="shipment-metrics"><div><small>EST. ARRIVAL · IST</small><strong>{eta}</strong></div><div><small>REMAINING</small><strong>{route ? `${(route.distance / 1000).toFixed(1)} km` : '—'}</strong></div></div>
    {shipment.refrigerated && <div className="temperature"><Thermometer size={23}/><div><strong>{temperature.toFixed(1)}°C <span className="badge success">In range</span></strong><p>Simulated sensor · target 0–4°C</p></div></div>}
    <div className="journey"><span className="stop-dot"/><div><span className="field-label">PICKUP</span><strong>{shipment.origin}</strong></div></div>
    <div className="cargo-details"><Package size={20}/><div><strong>{shipment.id}</strong><p>{shipment.cargo} · {shipment.weight}</p><small>Refrigerated container</small></div></div>
    <p className="fine-print">Estimated from the simulated position. No live traffic.</p>
  </section>
}

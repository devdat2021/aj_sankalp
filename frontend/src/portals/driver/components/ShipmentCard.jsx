import { Package, Thermometer, MapPin } from 'lucide-react'
import { useState } from 'react'
export default function ShipmentCard({ shipment, temperature, route }) {
  const [departureTime] = useState(() => Date.now())
  const eta = route ? new Date(departureTime + route.duration * 1000).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'Calculating…'
  return <section className="driver-card shipment-card">
    <div className="section-heading"><h2>Assigned shipment</h2><Package size={19} /></div>
    <span className="eyebrow">{shipment.id}</span><h3 className="cargo-title">{shipment.cargo}</h3>
    <p className="muted">{shipment.weight} · Refrigerated container</p>
    <span className="badge success">● {shipment.status}</span>
    <div className="journey"><div><span className="stop-dot"/><p><small>PICKUP</small><strong>{shipment.origin}</strong><span>Mangaluru, Karnataka</span></p></div><div><MapPin size={17}/><p><small>DELIVERY</small><strong>{shipment.destination}</strong><span>Udupi, Karnataka · demo facility</span></p></div></div>
    <div className="shipment-metrics"><div><small>EST. ARRIVAL · IST</small><strong>{eta}</strong></div><div><small>REMAINING</small><strong>{route ? `${(route.distance / 1000).toFixed(1)} km` : '—'}</strong></div></div>
    {shipment.refrigerated && <div className="temperature"><Thermometer size={23}/><div><strong>{temperature.toFixed(1)}°C <span className="badge success">In range</span></strong><p>Simulated sensor · target 0–4°C</p></div></div>}
    <p className="fine-print">ETA is a demo estimate from the simulated truck position; no live traffic.</p>
  </section>
}

import { Bell, Check } from 'lucide-react'
export default function AlertsPanel({ alerts, onAcknowledge, pendingId }) {
  return <section className="driver-card" id="alerts"><div className="section-heading"><h2><Bell size={18}/> Operations alerts</h2><span className="badge neutral">{alerts.filter(a => !a.acknowledged).length} unread</span></div><p className="muted">Simulated updates from your operations team</p>
    <div className="alerts-list">{alerts.map(alert => <article key={alert.id} className={`alert-item ${alert.severity}`}><div className="alert-heading"><span className={`badge ${alert.severity}`}>{alert.severity}</span><small>{alert.category}</small></div><h3>{alert.title}</h3><p>{alert.message}</p><button className="text-button" disabled={alert.acknowledged || pendingId !== null} onClick={() => onAcknowledge(alert.id)}>{alert.acknowledged ? <><Check size={14}/> Acknowledged</> : pendingId === alert.id ? 'Acknowledging…' : 'Acknowledge'}</button></article>)}</div>
  </section>
}

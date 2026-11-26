import { GitBranch, Check, ArrowRight } from 'lucide-react'
export default function RouteAlternatives({ routes, activeId, selectedId, onSelect, onRequest, pending }) {
  const selected = routes.find(route => route.id === selectedId)
  return <section className="driver-card" id="routes"><div className="section-heading"><h2><GitBranch size={18}/> Route options</h2><span className="muted">From current position</span></div>
    <div className="route-grid">{routes.map(route => <button key={route.id} className={`route-option ${selectedId === route.id ? 'selected' : ''}`} aria-pressed={selectedId === route.id} onClick={() => onSelect(route.id)} disabled={pending}>
      <span className="route-name">{route.name}{activeId === route.id && <span className="badge success"><Check size={12}/> Active</span>}</span>
      <span className="route-numbers">{Math.round(route.duration / 60)} <small>min</small><span>{(route.distance / 1000).toFixed(1)} km</span></span>
      <span className={route.conflicts.length ? 'route-risk' : 'route-clear'}>{route.conflicts.length ? `Intersects: ${route.conflicts.join(', ')}` : 'No simulated zone intersections'}</span>
      <small>{route.source}</small>
    </button>)}</div>
    <div className="route-footer"><p>Zone checks apply only to this demo. Road conditions and truck suitability are unverified.</p><button className="primary" disabled={!selected || selected.id === activeId || pending} onClick={() => onRequest(selected)}>{pending ? 'Awaiting simulated approval…' : 'Request rerouting'}<ArrowRight size={16}/></button></div>
  </section>
}

import { GitBranch, Check, ArrowRight, ShieldAlert } from 'lucide-react'

export default function RouteAlternatives({ routes, activeId, selectedId, onSelect, onPreview, onRequest, pending, waiting, loadingRoutes, allBlocked }) {
  const selected = routes.find(route => route.id === selectedId)
  const isBlocked = Boolean(selected?.conflicts?.length)
  const safeCount = routes.filter(r => !r.conflicts?.length).length

  return <section className="driver-card route-comparison" id="routes">
    <div className="section-heading">
      <h2><GitBranch size={18}/> Route options</h2>
      <span className="badge neutral">{loadingRoutes ? 'Calculating…' : `${safeCount} safe / ${routes.length} total`}</span>
    </div>
    <p className="muted route-intro">Compare safe alternatives from your current position</p>

    {allBlocked && !loadingRoutes && (
      <div className="hazard-banner-inline" style={{ marginBottom: 10 }} role="alert">
        <strong><ShieldAlert size={15}/> No safe route available. Logistics intervention required.</strong>
        <p>All known road corridors intersect reported flooding or road closures.</p>
      </div>
    )}

    {!routes.length && !loadingRoutes && <p className="cw-empty">No alternative routes available.</p>}
    <div className="route-grid">{routes.map(route => {
      const blocked = Boolean(route.conflicts?.length)
      const risk = route.risk == null ? null : Math.max(0, Math.min(1, route.risk > 1 ? route.risk / 100 : route.risk))
      const band = blocked ? 'high' : risk == null ? 'unknown' : risk < 0.34 ? 'low' : risk < 0.67 ? 'medium' : 'high'
      return (
        <button
          key={route.id}
          data-risk={band}
          className={`route-option ${selectedId === route.id ? 'selected' : ''} ${blocked ? 'route-blocked' : ''}`}
          aria-pressed={selectedId === route.id}
          onClick={() => onSelect(route.id)}
          disabled={pending}
        >
          <span className="route-name">
            {route.name}
            {activeId === route.id && !blocked ? (
              <span className="badge success"><Check size={12}/> Approved</span>
            ) : blocked ? (
              <span className="badge danger">Blocked</span>
            ) : selectedId === route.id ? (
              <span className="badge preview-badge">Safe preview</span>
            ) : (
              <span className="badge success">Safe</span>
            )}
          </span>
          <span className="route-numbers">
            {Math.round(route.duration / 60)} <small>min</small>
            <span>{(route.distance / 1000).toFixed(1)} km</span>
          </span>
          <span className={blocked ? 'route-risk' : 'route-clear'}>
            {blocked ? `Blocked: ${route.conflicts.join(', ')}` : 'Clear of reported hazards'}
          </span>
          <small>{route.source}</small>
        </button>
      )
    })}</div>

    <div className="route-footer">
      {selected && selected.id !== activeId && <button onClick={() => onPreview(selected)}>Preview on map</button>}
      <p>{isBlocked ? 'Selected route passes through a blocked/flooded zone and cannot be approved.' : 'Safe routes avoid reported flooding and closures. Approval updates your active trip.'}</p>
      <button
        className="primary"
        disabled={!selected || selected.id === activeId || isBlocked || pending || waiting || loadingRoutes}
        onClick={() => onRequest(selected)}
      >
        {waiting ? 'Awaiting logistics approval…' : pending ? 'Submitting request…' : 'Request Reroute'}
        <ArrowRight size={16}/>
      </button>
    </div>
  </section>
}

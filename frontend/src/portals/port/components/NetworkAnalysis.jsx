import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../../services/api';
import { formatCurrency } from '../services/crisisFormat';

function interpolateLatLng(p1, p2, t) {
  return [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
}

export default function NetworkAnalysis({ token }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Live map simulation state
  const [simPlaying, setSimPlaying] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [simTick, setSimTick] = useState(0);
  const [disruptedPortCity, setDisruptedPortCity] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/crisis/network/analysis', token, 'GET', undefined, undefined, 120000);
      setAnalysis(data);
    } catch (e) {
      setError(e?.message || 'Failed to load network analysis');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/crisis/network/analysis', token, 'GET', undefined, undefined, 120000);
        if (!cancelled) {
          setAnalysis(data);
          setError('');
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load network analysis');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Continuous vessel movement simulation tick
  useEffect(() => {
    if (!simPlaying) return undefined;
    const id = setInterval(() => {
      setSimTick(t => (t + 0.008 * simSpeed) % 1000);
    }, 60);
    return () => clearInterval(id);
  }, [simPlaying, simSpeed]);

  const portCoords = useMemo(() => {
    if (!analysis?.ports) return {};
    return Object.fromEntries(analysis.ports.map(p => [p.city.toLowerCase(), [p.latitude, p.longitude]]));
  }, [analysis]);

  // Build simulated coastal vessels from active routes
  const simulatedVessels = useMemo(() => {
    if (!analysis?.routes || !analysis?.ports) return [];
    const validRoutes = analysis.routes.filter(
      r => portCoords[r.origin.toLowerCase()] && portCoords[r.destination.toLowerCase()]
    );
    const activeFallback = validRoutes.filter(
      r => !disruptedPortCity || (
        r.origin.toLowerCase() !== disruptedPortCity.toLowerCase() &&
        r.destination.toLowerCase() !== disruptedPortCity.toLowerCase()
      )
    );
    const cargoTypes = ['Refrigerated Seafood', 'Cold-Chain Pharma', 'Container Cargo', 'Marine Fuel', 'Agricultural Export'];
    return validRoutes.slice(0, 14).map((r, idx) => {
      const touchesDisrupted = disruptedPortCity && (
        r.origin.toLowerCase() === disruptedPortCity.toLowerCase() ||
        r.destination.toLowerCase() === disruptedPortCity.toLowerCase()
      );
      const routeUsed = touchesDisrupted && activeFallback.length > 0
        ? activeFallback[idx % activeFallback.length]
        : r;
      const p1 = portCoords[routeUsed.origin.toLowerCase()];
      const p2 = portCoords[routeUsed.destination.toLowerCase()];
      const progress = (simTick * (0.6 + (idx % 4) * 0.2) + idx * 0.17) % 1;
      const pos = interpolateLatLng(p1, p2, progress);
      return {
        id: `VSL-${101 + idx}`,
        route: routeUsed,
        rerouted: Boolean(touchesDisrupted),
        originalTarget: `${r.origin} → ${r.destination}`,
        cargo: cargoTypes[idx % cargoTypes.length],
        position: pos,
        progressPct: Math.round(progress * 100),
      };
    });
  }, [analysis, portCoords, simTick, disruptedPortCity]);

  if (loading && !analysis) {
    return <section><p className="muted">Calculating NetworkX graph metrics and coastal port health…</p></section>;
  }

  if (error && !analysis) {
    return (
      <section>
        <div className="error" role="alert">{error}</div>
        <button onClick={load}>Retry</button>
      </section>
    );
  }

  if (!analysis) return null;

  const {
    metrics,
    ports,
    routes,
    critical_nodes,
    bottleneck_routes,
    fleet_summary,
    cargo_summary,
    coastalwatch_live,
  } = analysis;

  const livePort = coastalwatch_live?.port;
  const reroutedCount = simulatedVessels.filter(v => v.rerouted).length;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* KPI Strip */}
      <div className="stats">
        <article>
          <p>Active routes</p>
          <strong>{metrics.active_routes} / {metrics.total_routes}</strong>
          <small>{metrics.graph_nodes} nodes · {metrics.graph_edges} directed edges</small>
        </article>
        <article>
          <p>Disrupted links</p>
          <strong>{disruptedPortCity ? reroutedCount : metrics.disrupted_links}</strong>
          <small>{metrics.connected_components} connected component(s)</small>
        </article>
        <article>
          <p>High-risk routes</p>
          <strong>{metrics.high_risk_routes}</strong>
          <small>Risk ≥ 25% or congestion ≥ 65%</small>
        </article>
        <article>
          <p>Network avg risk</p>
          <strong>{metrics.avg_network_risk_pct}%</strong>
          <small>Avg port congestion: {metrics.avg_port_congestion_pct}%</small>
        </article>
      </div>

      {/* Live Simulated Coastal Network Map + Status Cards */}
      <div className="split" style={{ alignItems: 'start' }}>
        <section style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div>
              <h2 style={{ margin: 0 }}>Indian Coastal Port Network</h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                {simulatedVessels.length} simulated vessels moving · Click any port marker to toggle disruption
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary"
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => setSimPlaying(p => !p)}
              >
                {simPlaying ? 'Pause sim' : 'Play sim'}
              </button>
              <button
                type="button"
                className="secondary"
                style={{ padding: '6px 12px', fontSize: 13 }}
                onClick={() => setSimSpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}
              >
                {simSpeed}x speed
              </button>
              {disruptedPortCity && (
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: '6px 12px', fontSize: 13 }}
                  onClick={() => setDisruptedPortCity('')}
                >
                  Clear {disruptedPortCity} closure
                </button>
              )}
            </div>
          </div>

          <MapContainer center={[17.5, 78.5]} zoom={5} scrollWheelZoom={true} style={{ height: 420, width: '100%', borderRadius: 12 }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {routes.map(r => {
              const p1 = portCoords[r.origin.toLowerCase()];
              const p2 = portCoords[r.destination.toLowerCase()];
              if (!p1 || !p2) return null;
              const touchesDisrupted = disruptedPortCity && (
                r.origin.toLowerCase() === disruptedPortCity.toLowerCase() ||
                r.destination.toLowerCase() === disruptedPortCity.toLowerCase()
              );
              const isBlocked = !r.is_active || touchesDisrupted;
              return (
                <Polyline
                  key={r.route_id}
                  positions={[p1, p2]}
                  pathOptions={{
                    color: isBlocked ? '#dc2626' : r.risk_score >= 0.25 ? '#e56a37' : '#047857',
                    weight: touchesDisrupted ? 2.5 : 2,
                    dashArray: touchesDisrupted ? '6 6' : undefined,
                    opacity: touchesDisrupted ? 0.85 : 0.5,
                  }}
                />
              );
            })}

            {/* Animated Simulated Vessels */}
            {simulatedVessels.map(v => (
              <CircleMarker
                key={v.id}
                center={v.position}
                radius={5}
                pathOptions={{
                  color: v.rerouted ? '#1d4ed8' : '#0f172a',
                  fillColor: v.rerouted ? '#3b82f6' : '#10b981',
                  fillOpacity: 0.95,
                  weight: 1.5,
                }}
              >
                <Tooltip direction="top" offset={[0, -6]}>
                  <span>
                    <strong>{v.id}</strong> ({v.cargo})<br />
                    {v.route.origin} → {v.route.destination} ({v.progressPct}%)
                    {v.rerouted ? ` · Rerouted (avoiding ${disruptedPortCity})` : ''}
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* Port Nodes (clickable to simulate port disruption) */}
            {ports.map(p => {
              const isDisrupted = disruptedPortCity && p.city.toLowerCase() === disruptedPortCity.toLowerCase();
              const color = isDisrupted || p.operational_status !== 'operational'
                ? '#dc2626'
                : p.congestion > 0.65
                  ? '#e56a37'
                  : '#047857';
              return (
                <CircleMarker
                  key={p.port_id}
                  center={[p.latitude, p.longitude]}
                  radius={isDisrupted ? 12 : p.congestion > 0.65 ? 9 : 7}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.85 }}
                  eventHandlers={{
                    click: () => {
                      setDisruptedPortCity(prev => (prev.toLowerCase() === p.city.toLowerCase() ? '' : p.city));
                    },
                  }}
                >
                  <Popup>
                    <strong>{p.name} ({p.port_id})</strong><br />
                    {p.city}, {p.state}<br />
                    Congestion: {Math.round(p.congestion * 100)}% · Status: {isDisrupted ? 'DISRUPTED (SIMULATED)' : p.operational_status}<br />
                    Cold storage: {p.has_cold_storage ? `Yes (${p.cold_storage_capacity} TEUs)` : 'No'}<br />
                    <em>Click marker to {isDisrupted ? 'restore' : 'simulate closure'}</em>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Green dot: live vessel · Blue dot: rerouted vessel · Green/Orange port: operational/congested · Red (dashed): simulated closure ({reroutedCount} rerouted)
          </p>
        </section>

        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ padding: 24 }}>
            <h2 style={{ margin: '0 0 12px' }}>Fleet &amp; Cargo Status</h2>
            <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <span className="muted">Total fleet</span>
                <span style={{ fontWeight: 600 }}>{fleet_summary?.total_vehicles ?? 0} <span className="muted" style={{ fontWeight: 400 }}>({fleet_summary?.available_vehicles ?? 0} free · {fleet_summary?.utilized_vehicles ?? 0} active)</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <span className="muted">Refrigerated fleet</span>
                <span style={{ fontWeight: 600 }}>{fleet_summary?.refrigerated_vehicles ?? 0} <span className="muted" style={{ fontWeight: 400 }}>({fleet_summary?.refrigerated_available ?? 0} free)</span></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <span className="muted">Network cargo value</span>
                <span style={{ fontWeight: 600 }}>{formatCurrency(cargo_summary?.total_cargo_value ?? 0)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Modeled shipments</span>
                <span style={{ fontWeight: 600 }}>{cargo_summary?.total_shipments ?? 0} <span className="muted" style={{ fontWeight: 400 }}>({cargo_summary?.cold_chain_shipments ?? 0} cold-chain)</span></span>
              </div>
            </div>
          </section>

          {livePort && (
            <section style={{ padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>CoastalWatch Live Port</h2>
                <span className="badge">{livePort.status}</span>
              </div>
              <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                  <span className="muted">Facility</span>
                  <span style={{ fontWeight: 600 }}>{livePort.name} ({livePort.id})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                  <span className="muted">Berths free</span>
                  <span style={{ fontWeight: 600 }}>{livePort.berths - livePort.occupied_berths} / {livePort.berths}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                  <span className="muted">Cold storage free</span>
                  <span style={{ fontWeight: 600 }}>{livePort.cold_capacity - livePort.cold_occupied} / {livePort.cold_capacity} t</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Active consignments</span>
                  <span style={{ fontWeight: 600 }}>{coastalwatch_live.active_consignments}</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <section style={{ padding: 24 }}>
        <h2>Port Network Congestion &amp; Cold Storage <span>{ports.length} coastal ports</span></h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Port</th><th>City / State</th><th>Congestion</th><th>Cold Storage</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ports.map(p => {
                const isDisrupted = disruptedPortCity && p.city.toLowerCase() === disruptedPortCity.toLowerCase();
                return (
                  <tr key={p.port_id}>
                    <td><strong>{p.name}</strong> <small className="muted">({p.port_id})</small></td>
                    <td>{p.city}{p.state ? `, ${p.state}` : ''}</td>
                    <td style={{ minWidth: 160 }}>
                      <span>{Math.round((p.congestion || 0) * 100)}%</span>
                      <progress value={Math.round((p.congestion || 0) * 100)} max={100} style={{ marginTop: 4 }} />
                    </td>
                    <td>{p.has_cold_storage ? `Available (${p.cold_storage_capacity} TEUs)` : 'None'}</td>
                    <td><span className="badge">{isDisrupted ? 'disrupted (sim)' : p.operational_status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="split">
        <section style={{ padding: 24 }}>
          <h2>Critical Network Nodes <span>Betweenness centrality</span></h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Node</th><th>Type</th><th>Centrality</th><th>Degree (In/Out)</th></tr>
              </thead>
              <tbody>
                {critical_nodes.map(n => (
                  <tr key={n.node}>
                    <td><strong>{n.node}</strong></td>
                    <td>{n.is_port ? `Port (${n.port_id})` : 'Inland hub'}</td>
                    <td>{n.betweenness_centrality.toFixed(3)}</td>
                    <td>{n.in_degree} / {n.out_degree}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ padding: 24 }}>
          <h2>Top Bottleneck Routes <span>Risk &amp; congestion</span></h2>
          <div className="tablewrap">
            <table>
              <thead>
                <tr><th>Route</th><th>Mode</th><th>Congestion</th><th>Risk</th><th>Score</th></tr>
              </thead>
              <tbody>
                {bottleneck_routes.map(b => (
                  <tr key={b.route_id}>
                    <td><strong>{b.origin} → {b.destination}</strong></td>
                    <td>{b.transport_mode}</td>
                    <td>{Math.round((b.congestion || 0) * 100)}%</td>
                    <td>{Math.round((b.risk_score || 0) * 100)}%</td>
                    <td><span className="badge">{b.bottleneck_score}/100</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

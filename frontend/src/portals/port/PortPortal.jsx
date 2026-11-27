import { lazy, Suspense } from 'react';
const CrisisSimulator = lazy(() => import('./CrisisSimulator'));
import './crisis.css';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../components/AuthContext';
import Cargo from '../../components/Cargo';
import Requests from '../../components/Requests';
import Weather from '../../components/Weather';
import Intelligence from '../../components/Intelligence';
import { Alerts, Incidents, Capacity } from '../../components/Operations';
import { Badge } from '../../components/Forms';
import { api } from '../../services/api';
import ControlTowerMap from './components/ControlTowerMap';
import NetworkAnalysis from './components/NetworkAnalysis';
import WhatIfAnalysis from './components/WhatIfAnalysis';

import WorkspaceNav from '../../components/WorkspaceNav';
import { LayoutDashboard, Truck, Package, TriangleAlert, ClipboardList, Bell, CloudSun, Activity, Network, GitCompare, History } from 'lucide-react';
const tabs = [['Overview', LayoutDashboard], ['Arrivals & trucks', Truck], ['Cargo', Package], ['Incidents', TriangleAlert], ['Requests', ClipboardList], ['Alerts', Bell], ['Weather', CloudSun], ['Network Analysis', Network], ['What-If Analysis', GitCompare], ['Crisis Simulator', Activity], ['Audit trail', History]];

export default function PortPortal() {
    const { token, user, logout } = useAuth();
    const [data, setData] = useState(null), [tab, setTab] = useState('Overview'), [error, setError] = useState(''), [query, setQuery] = useState('');
    const refresh = useCallback(async () => { try { setData(await api('/port/dashboard', token)); setError('') } catch (e) { setError(e.message) } }, [token]);
    useEffect(() => { if (!token) return; const initial = setTimeout(refresh, 0); const id = setInterval(refresh, 8000); return () => { clearTimeout(initial); clearInterval(id) } }, [token, refresh]);
    async function act(path, method, body) { try { const r = await api(path, token, method, body); await refresh(); return r } catch (e) { setError(e.message); throw e } }
    const table = (rows, fields) => <div className="tablewrap"><table><thead><tr>{fields.map(f => <th key={f}>{f.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.filter(r => JSON.stringify(r).toLowerCase().includes(query.toLowerCase())).map(r => <tr key={r.id}>{fields.map(f => <td key={f}>{String(r[f] ?? '—')}</td>)}</tr>)}</tbody></table>{!rows.length && <p>No records yet.</p>}</div>;

    const renderOverview = () => {
        const p = data.port;
        const vessels = data.vessels || [];
        const dockedVessels = vessels.filter(v => ['docked', 'berthed'].includes((v.movement_status || v.status || '').toLowerCase()));
        const incomingVessels = vessels.filter(v => !['docked', 'berthed', 'departed'].includes((v.movement_status || v.status || '').toLowerCase()));
        const openDocking = (data.docking_requests || []).filter(r => ['pending', 'slot_suggested'].includes(r.status));
        const openPortReqs = (data.port_requests || []).filter(r => ['pending', 'slot_suggested'].includes(r.status));
        const openIncidents = (data.incidents || []).filter(i => ['reported', 'confirmed'].includes(i.status));
        const coldRiskShipments = (data.shipments || []).filter(s => s.requires_cold && s.status !== 'delivered' && s.temperature != null && s.max_temperature != null && s.temperature >= s.max_temperature - 1);
        const readinessShipments = (data.shipments || []).filter(s => ['at_port', 'unloaded'].includes(s.status));
        const coldPct = Math.round(((p.cold_occupied || 0) / Math.max(1, p.cold_capacity || 1)) * 100);
        const yardPct = Math.round(((p.yard_occupied ?? 0) / Math.max(1, p.yard_capacity ?? 1)) * 100);
        const handPct = Math.round(((p.handling_occupied ?? 0) / Math.max(1, p.handling_capacity ?? 1)) * 100);

        return <>
            <div className="stats">
                <article>
                    <p>Vessels at port</p>
                    <strong>{dockedVessels.length} / {vessels.length}</strong>
                    <small>{dockedVessels.length} docked · {incomingVessels.length} incoming</small>
                </article>
                <article>
                    <p>Berths occupied</p>
                    <strong>{p.occupied_berths} / {p.berths}</strong>
                    <small>{p.berths - p.occupied_berths} berths available ({p.status})</small>
                </article>
                <article>
                    <p>Cold &amp; yard usage</p>
                    <strong>{coldPct}% · {yardPct}%</strong>
                    <small>Cold {coldPct}% · Yard {yardPct}% · Handling {handPct}%</small>
                </article>
                <article>
                    <p>Attention required</p>
                    <strong>{openDocking.length + openPortReqs.length + openIncidents.length}</strong>
                    <small>{openDocking.length + openPortReqs.length} requests · {openIncidents.length} incidents · {readinessShipments.length} cargo</small>
                </article>
            </div>

            <div className="split">
                <section>
                    <h2>Coastal network <span>Port · Vessels · Trucks · Incidents</span></h2>
                    <ControlTowerMap data={data} />
                    <p className="muted">Green: Port · Teal: Vessels · Blue: Trucks · Orange: Incidents. Click markers for live details.</p>
                </section>
                <div className="workflow-content">
                    <Capacity data={data} user={user} mutate={act} />
                </div>
            </div>

            <div className="split">
                <section>
                    <h2>Recommended docking order <span>{openDocking.length} pending</span></h2>
                    {!openDocking.length ? (
                        <p className="muted">No pending docking requests. All vessel arrivals are clear.</p>
                    ) : (
                        <div className="tablewrap">
                            <table>
                                <thead>
                                    <tr><th>Order</th><th>Vessel</th><th>Score</th><th>Eligibility</th><th>Constraints</th></tr>
                                </thead>
                                <tbody>
                                    {openDocking.map(r => (
                                        <tr key={r.id}>
                                            <td><strong>#{r.recommended_order || '—'}</strong></td>
                                            <td>{r.vessel_id}</td>
                                            <td>{r.priority_score ?? r.priority ?? 0}/100</td>
                                            <td><Badge>{r.eligible_for_approval ? 'eligible' : 'blocked'}</Badge></td>
                                            <td>{r.constraints?.length ? r.constraints.join(', ') : 'Ready for berth'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <button style={{ marginTop: 12 }} onClick={() => setTab('Requests')}>Review requests ({openDocking.length + openPortReqs.length})</button>
                </section>

                <section>
                    <h2>Immediate operational attention <span>Incidents · Cold Chain · Readiness</span></h2>
                    {!openIncidents.length && !coldRiskShipments.length && !readinessShipments.length ? (
                        <p className="muted">No urgent incidents or temperature alerts right now.</p>
                    ) : (
                        <div className="tablewrap">
                            <table>
                                <thead><tr><th>Type</th><th>Target</th><th>Detail</th></tr></thead>
                                <tbody>
                                    {openIncidents.map(i => (
                                        <tr key={i.id}>
                                            <td><Badge>{i.severity}</Badge></td>
                                            <td>{i.shipment_id}</td>
                                            <td>{i.category.replaceAll('_', ' ')}: {i.description}</td>
                                        </tr>
                                    ))}
                                    {coldRiskShipments.map(s => (
                                        <tr key={`cold-${s.id}`}>
                                            <td><Badge>warning</Badge></td>
                                            <td>{s.id}</td>
                                            <td>Temp {s.temperature}°C near max {s.max_temperature}°C ({s.cargo})</td>
                                        </tr>
                                    ))}
                                    {readinessShipments.map(s => (
                                        <tr key={`ready-${s.id}`}>
                                            <td><Badge>{s.status}</Badge></td>
                                            <td>{s.id}</td>
                                            <td>{s.status === 'at_port' ? 'Awaiting unloading confirmation' : 'Unloaded — mark ready for pickup'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {openIncidents.length > 0 && <button className="secondary" onClick={() => setTab('Incidents')}>Review incidents ({openIncidents.length})</button>}
                        {readinessShipments.length > 0 && <button className="secondary" onClick={() => setTab('Cargo')}>Update cargo readiness ({readinessShipments.length})</button>}
                    </div>
                </section>
            </div>

            <section>
                <h2>Vessels &amp; cargo in motion <span>{dockedVessels.length} docked · {incomingVessels.length} incoming</span></h2>
                {table(vessels.map(v => ({ ...v, movement: v.movement_status || v.status, cargo_count: data.shipments.filter(s => s.vessel_id === v.id).length })), ['id', 'name', 'movement', 'eta', 'source', 'cargo_count'])}
            </section>
        </>;
    };

    return <div className="layout"><WorkspaceNav role="Port authority" tabs={tabs} current={tab} onSelect={name => { setTab(name); setQuery('') }} user={user} logout={logout} /><main><div className="title"><div><h1>{tab === 'Overview' ? 'Port control tower' : tab}</h1><p>{data?.port?.name || 'Port operations'} · {data?.simulated ? 'Demo operational records' : 'Operational records'}</p></div><button onClick={refresh}>Refresh data</button></div>{error && <div className="error" role="alert">{error}</div>}{!data ? <p>Loading operations…</p> : <>
        {tab === 'Crisis Simulator' && <div className="crisis-workspace"><Suspense fallback={<p>Loading simulator...</p>}><CrisisSimulator /></Suspense></div>}
        {tab === 'Network Analysis' && <NetworkAnalysis token={token} />}
        {tab === 'What-If Analysis' && <WhatIfAnalysis token={token} />}
        {tab === 'Overview' && renderOverview()}
        {tab === 'Arrivals & trucks' && <section><input aria-label="Search records" placeholder="Search records…" value={query} onChange={e => setQuery(e.target.value)} /><><h2>Vessel arrivals</h2>{table(data.vessels, ['id', 'name', 'status', 'eta'])}<h2>Truck operations</h2>{table(data.vehicles, ['id', 'name', 'status'])}</></section>}
        <div className="workflow-content">
            {tab === 'Cargo' && <Cargo data={data} user={user} mutate={act} />}
            {tab === 'Requests' && <Requests data={data} user={user} mutate={act} />}
            {tab === 'Incidents' && <Incidents data={data} user={user} mutate={act} />}
            {tab === 'Alerts' && <Alerts data={data} user={user} mutate={act} />}
            {tab === 'Weather' && <Weather port={data.port} token={token} />}
        </div>
        {tab === 'Audit trail' && <section><h2>Authority decision history</h2>{table(data.audit.map((a, i) => ({ ...a, id: i })), ['actor', 'action', 'record_id', 'created_at'])}</section>}
    </>}<footer>CoastWatch-SCM · Demonstration workspace · Estimates require operational review</footer></main></div>
}

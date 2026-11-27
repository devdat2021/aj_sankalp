import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../../../services/api';
import { formatCurrency, formatDelay } from '../services/crisisFormat';

const DISRUPTION_TYPES = [
  { value: 'port_closure', label: 'Port Closure' },
  { value: 'route_closure', label: 'Route Closure' },
  { value: 'severe_weather', label: 'Severe Weather' },
  { value: 'strike', label: 'Strike' },
  { value: 'vehicle_shortage', label: 'Vehicle Shortage' },
  { value: 'warehouse_disruption', label: 'Warehouse Disruption' },
  { value: 'other', label: 'Others' },
];

const DEFAULT_LOCATIONS = [
  'Mumbai Port', 'JNPT', 'Mundra', 'Mangalore', 'Chennai', 'Kolkata',
  'Kochi', 'Visakhapatnam', 'Kandla', 'Mormugao', 'Tuticorin', 'Paradip',
  'Delhi', 'Ahmedabad', 'Bengaluru', 'Hyderabad',
];

const QUICK_PRESETS = [
  {
    label: 'Duration Escalation',
    description: 'Mumbai Port closure — 72h vs 120h',
    scenarios: [
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 72, severity: 'high', capacity_reduction: 1.0 },
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 120, severity: 'high', capacity_reduction: 1.0 },
    ],
  },
  {
    label: 'Severity Comparison',
    description: 'JNPT Strike — medium vs high severity',
    scenarios: [
      { disruption_type: 'strike', location: 'JNPT', duration_hours: 96, severity: 'medium', capacity_reduction: 0.6 },
      { disruption_type: 'strike', location: 'JNPT', duration_hours: 96, severity: 'high', capacity_reduction: 1.0 },
    ],
  },
  {
    label: 'Port vs Port',
    description: 'Mumbai Port vs Chennai Port closure (72h)',
    scenarios: [
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 72, severity: 'high', capacity_reduction: 1.0 },
      { disruption_type: 'port_closure', location: 'Chennai', duration_hours: 72, severity: 'high', capacity_reduction: 1.0 },
    ],
  },
  {
    label: '3-Way Duration',
    description: 'Mumbai Port 48h / 72h / 120h',
    scenarios: [
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 48, severity: 'high', capacity_reduction: 1.0 },
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 72, severity: 'high', capacity_reduction: 1.0 },
      { disruption_type: 'port_closure', location: 'Mumbai Port', duration_hours: 120, severity: 'high', capacity_reduction: 1.0 },
    ],
  },
];

export default function WhatIfAnalysis({ token }) {
  const [locations, setLocations] = useState(DEFAULT_LOCATIONS);
  const [scenarios, setScenarios] = useState(QUICK_PRESETS[0].scenarios);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) return;
    api('/crisis/ports', token)
      .then(ports => {
        if (Array.isArray(ports) && ports.length > 0) {
          const portNames = ports.map(p => p.city === 'Mumbai' ? 'Mumbai Port' : p.city);
          setLocations(Array.from(new Set([...portNames, ...DEFAULT_LOCATIONS])));
        }
      })
      .catch(() => {});
  }, [token]);

  function addScenario() {
    if (scenarios.length >= 5) return;
    setScenarios([
      ...scenarios,
      { disruption_type: 'port_closure', location: 'Mangalore', duration_hours: 72, severity: 'medium', capacity_reduction: 0.7 },
    ]);
  }

  function removeScenario(idx) {
    if (scenarios.length <= 2) return;
    setScenarios(scenarios.filter((_, i) => i !== idx));
  }

  function updateScenario(idx, field, value) {
    setScenarios(scenarios.map((sc, i) => (i === idx ? { ...sc, [field]: value } : sc)));
  }

  async function handleRun(override) {
    const payload = override || scenarios;
    setLoading(true);
    setError('');
    try {
      const res = await api('/crisis/what-if', token, 'POST', payload, undefined, 120000);
      setResult(res);
    } catch (e) {
      setError(e?.message || 'What-If comparison failed');
    } finally {
      setLoading(false);
    }
  }

  const chartData = result?.scenarios?.map((r, i) => ({
    name: `S${i + 1}: ${r.scenario.location} (${r.scenario.duration_hours}h)`,
    affected: r.impact_summary.total_affected_shipments,
    delayHours: Number(r.impact_summary.average_delay_hours.toFixed(1)),
    coldRisk: r.impact_summary.cold_chain_at_risk,
  })) || [];

  return (
    <div>
      <section>
        <h2>What-If Scenario Comparison</h2>
        <p className="muted">
          Configure 2 to 5 disruption scenarios and run the backend simulation engine side-by-side.
        </p>

        <h3 style={{ marginTop: 18, marginBottom: 10, fontSize: 14, color: 'var(--ink)' }}>Quick Presets</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {QUICK_PRESETS.map(p => (
            <div
              key={p.label}
              style={{
                padding: 16,
                border: '1px solid var(--line)',
                borderRadius: 16,
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', marginBottom: 4 }}>{p.label}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{p.description}</div>
              </div>
              <button
                type="button"
                className="secondary"
                disabled={loading}
                onClick={() => { setScenarios(p.scenarios); handleRun(p.scenarios); }}
              >
                Load &amp; compare
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2>Configure Scenarios ({scenarios.length}/5)</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="secondary" onClick={addScenario} disabled={scenarios.length >= 5 || loading}>
              + Add Scenario
            </button>
            <button type="button" onClick={() => handleRun()} disabled={loading}>
              {loading ? 'Running simulation…' : 'Run Comparison'}
            </button>
          </div>
        </div>

        {error && <div className="error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {scenarios.map((sc, idx) => (
            <article key={idx} style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong>Scenario {idx + 1}</strong>
                {scenarios.length > 2 && (
                  <button type="button" className="secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => removeScenario(idx)}>
                    Remove
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#637986' }}>
                  Disruption Type
                  <select
                    value={sc.disruption_type}
                    onChange={e => updateScenario(idx, 'disruption_type', e.target.value)}
                    style={{ width: '100%', margin: '4px 0' }}
                  >
                    {DISRUPTION_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                {sc.disruption_type === 'other' && (
                  <label style={{ fontSize: 12, color: '#637986' }}>
                    Description
                    <input
                      type="text"
                      placeholder="Write disruption description…"
                      value={sc.description || ''}
                      onChange={e => updateScenario(idx, 'description', e.target.value)}
                      style={{ width: '100%', margin: '4px 0' }}
                    />
                  </label>
                )}
                <label style={{ fontSize: 12, color: '#637986' }}>
                  Location
                  <select
                    value={sc.location}
                    onChange={e => updateScenario(idx, 'location', e.target.value)}
                    style={{ width: '100%', margin: '4px 0' }}
                  >
                    {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12, color: '#637986' }}>
                  Duration (hours)
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={sc.duration_hours}
                    onChange={e => updateScenario(idx, 'duration_hours', Number(e.target.value) || 24)}
                    style={{ width: '100%', margin: '4px 0' }}
                  />
                </label>
                <label style={{ fontSize: 12, color: '#637986' }}>
                  Severity
                  <select
                    value={sc.severity}
                    onChange={e => updateScenario(idx, 'severity', e.target.value)}
                    style={{ width: '100%', margin: '4px 0' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>

      {result && (
        <>
          <section>
            <h2>Comparison Impact Chart</h2>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="affected" name="Affected Shipments" fill="#087e8b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="delayHours" name="Avg Delay (h)" fill="#254ba6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="coldRisk" name="Cold-Chain at Risk" fill="#e56a37" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2>Scenario Comparison Matrix</h2>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>Affected Shipments</th>
                    <th>Cargo Exposed</th>
                    <th>Avg Delay</th>
                    <th>Cold-Chain at Risk</th>
                    <th>Recommended Strategy</th>
                    <th>Recovery Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map((r, i) => (
                    <tr key={r.simulation_id}>
                      <td>
                        <strong>S{i + 1}: {r.scenario.location}</strong><br />
                        <small className="muted">{r.scenario.disruption_type.replaceAll('_', ' ')} · {r.scenario.duration_hours}h · {r.scenario.severity}</small>
                      </td>
                      <td>{r.impact_summary.total_affected_shipments}</td>
                      <td>{formatCurrency(r.impact_summary.total_cargo_value_exposed)}</td>
                      <td>{formatDelay(r.impact_summary.average_delay_hours)}</td>
                      <td>{r.impact_summary.cold_chain_at_risk}</td>
                      <td><span className="badge">{r.recommended_strategy?.strategy_type || 'balanced'}</span></td>
                      <td>{formatCurrency(r.recommended_strategy?.additional_cost_inr || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

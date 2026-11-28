import { useState, useEffect } from 'react'
import { iso, options, stamp } from '../services/format'
import { ActionButton, ActionForm, Badge, Empty, Field } from './Forms'
import { api } from '../services/api'

export function Incidents({ data, user, mutate }) {
  return <div className="cw-stack"><section className="cw-card"><h2>Report an incident</h2><p>Reports are saved immediately and shared with relevant operators. Distress reports are internal notifications, not emergency calls.</p>
    <ActionForm label="Submit report" disabled={!data.shipments.length} reset submit={f => mutate('/incidents', 'POST', { ...f, lat: Number(f.lat), lng: Number(f.lng) })}>
      <Field label="Consignment" name="shipment_id" options={options(data.shipments)} /><Field label="Category" name="category" options={['flood', 'roadblock', 'storm', 'obstruction', 'breakdown', 'refrigeration', 'adverse_seas', 'vessel_issue', 'distress']} /><Field label="Severity" name="severity" options={['low', 'medium', 'high']} /><Field label="Description" name="description" type="textarea" minLength={5} maxLength={1000} /><Field label="Latitude" name="lat" type="number" min="-90" max="90" step="any" /><Field label="Longitude" name="lng" type="number" min="-180" max="180" step="any" />
    </ActionForm></section>
    {!data.incidents.length && <Empty>No incidents reported.</Empty>}{data.incidents.map(i => <section className="cw-card" key={i.id}><div className="cw-row"><h3>{i.category.replaceAll('_', ' ')} · {i.shipment_id}</h3><Badge>{i.status}</Badge></div><p>{i.description}</p><p><Badge>{i.severity}</Badge> · {stamp(i.created_at)} · {i.lat}, {i.lng}</p>{user.role === 'port' && <div className="cw-actions">{(i.status === 'reported' ? ['confirmed', 'rejected'] : i.status === 'confirmed' ? ['resolved'] : []).map(status => <ActionButton key={status} action={() => mutate(`/incidents/${i.id}`, 'PATCH', { status })}>{status === 'confirmed' ? 'Confirm incident' : status === 'rejected' ? 'Reject report' : 'Mark resolved'}</ActionButton>)}</div>}</section>)}</div>
}

export function Alerts({ data, user, mutate }) {
  return <div className="cw-stack">{user.role === 'port' && <section className="cw-card"><h2>Publish a disruption warning</h2><p>One warning reaches the relevant company and assigned operators, with separate acknowledgments.</p><ActionForm label="Publish warning" reset submit={f => mutate('/alerts', 'POST', { message: f.message, severity: f.severity, shipment_ids: f.shipment_id ? [f.shipment_id] : [] })}><Field label="Audience" name="shipment_id" options={[{ value: '', label: 'All port consignments' }, ...options(data.shipments)]} required={false} /><Field label="Severity" name="severity" options={['warning', 'critical', 'info']} /><Field label="Warning message" name="message" type="textarea" minLength={3} maxLength={1000} /></ActionForm></section>}
    {!data.alerts.length && <Empty>No notifications yet.</Empty>}{data.alerts.map(a => <section className="cw-card" key={a.id}><div className="cw-row"><Badge>{a.severity}</Badge><small>{stamp(a.created_at)}</small></div><p>{a.message}</p><ActionButton disabled={a.read_by.includes(user.id)} action={() => mutate(`/alerts/${a.id}/read`, 'PATCH')}>{a.read_by.includes(user.id) ? 'Acknowledged by you' : 'Acknowledge'}</ActionButton></section>)}
  </div>
}

export function Capacity({ data, user, mutate }) {
  const p = data.port
  const yardCap = p.yard_capacity ?? 0
  const yardOcc = p.yard_occupied ?? 0
  const handCap = p.handling_capacity ?? 0
  const handOcc = p.handling_occupied ?? 0
  return <section className="cw-card"><div className="cw-row"><h2>{p.name}</h2><Badge>{p.status}</Badge></div><div className="cw-facts"><span><strong>{p.berths - p.occupied_berths} / {p.berths}</strong>Berths available</span><span><strong>{p.cold_capacity - p.cold_occupied} / {p.cold_capacity} t</strong>Cold capacity available</span><span><strong>{yardCap - yardOcc} / {yardCap} t</strong>Yard space available</span><span><strong>{handCap - handOcc} / {handCap} t</strong>Cargo handling available</span></div><p className="cw-muted">Approved reservations are included in occupancy.</p>{user.role === 'port' && <details><summary>Update capacity</summary><ActionForm label="Save capacity" submit={f => mutate(`/ports/${p.id}/capacity`, 'PATCH', { status: f.status, ...Object.fromEntries(['berths', 'occupied_berths', 'cold_capacity', 'cold_occupied', 'yard_capacity', 'yard_occupied', 'handling_capacity', 'handling_occupied'].map(k => [k, Number(f[k])])) })}><Field label="Operational status" name="status" options={['open', 'restricted', 'closed']} value={p.status} />{[['berths', 'Total berths'], ['occupied_berths', 'Occupied / reserved berths'], ['cold_capacity', 'Cold capacity (tonnes)'], ['cold_occupied', 'Occupied / reserved cold capacity (tonnes)'], ['yard_capacity', 'Yard space capacity (tonnes)'], ['yard_occupied', 'Yard space occupied (tonnes)'], ['handling_capacity', 'Cargo handling capacity (tonnes)'], ['handling_occupied', 'Cargo handling occupied (tonnes)']].map(([name, label]) => <Field key={name} name={name} label={label} type="number" min="0" step={name.includes('berth') ? '1' : 'any'} value={p[name] ?? 0} />)}</ActionForm></details>}</section>
}

export function MarineConditions({ portId, token }) {
  const [weather, setWeather] = useState(null)
  const [error, setError] = useState('')
  const loading = Boolean(portId && !weather && !error)

  useEffect(() => {
    let active = true
    if (!portId) return
    api(`/ports/${portId}/weather?mode=marine`, token)
      .then(res => { if (active) { setWeather(res); setError('') } })
      .catch(err => { if (active) setError(err.message) })
    return () => { active = false }
  }, [portId, token])

  const hourly = weather?.forecast?.hourly
  const waveHeight = hourly?.wave_height?.[0]
  const wavePeriod = hourly?.wave_period?.[0]
  const condition = waveHeight == null ? 'Unknown' : waveHeight < 1.0 ? 'Calm seas (Favorable)' : waveHeight < 2.0 ? 'Moderate swell' : 'Rough seas (Caution advised)'

  return <section className="cw-card">
    <div className="cw-row">
      <h3>Marine Conditions · Coastal Approach</h3>
      <Badge>{loading ? 'Loading…' : error ? 'Offline' : condition}</Badge>
    </div>
    {loading && <p className="cw-muted">Fetching Open-Meteo marine telemetry…</p>}
    {error && <p className="cw-muted">Marine forecast unavailable ({error}). Navigation reports remain functional.</p>}
    {weather && (
      <div>
        <div className="cw-facts">
          <span><strong>{waveHeight != null ? `${waveHeight} m` : '—'}</strong>Significant wave height</span>
          <span><strong>{wavePeriod != null ? `${wavePeriod} s` : '—'}</strong>Wave period</span>
          <span><strong>{condition}</strong>Sea state</span>
        </div>
        <small className="cw-muted">Source: {weather.source || 'Open-Meteo Marine'} · Updated {stamp(weather.fetched_at)} {weather.stale ? '(Cached)' : ''}</small>
      </div>
    )}
  </section>
}

export function VesselOperations({ data, mutate, token }) {
  return <div className="cw-stack">{!data.vessels.length && <Empty>No vessel assigned.</Empty>}{data.vessels.map(v => {
    const activeDock = data.docking_requests.find(r => r.vessel_id === v.id && ['pending', 'approved'].includes(r.status))
    const state = v.movement_status || 'planned'
    const cargo = data.shipments.filter(s => s.vessel_id === v.id)
    const events = { planned: ['departed', 'arrived'], departed: ['arrived'], arrived: activeDock?.status === 'approved' ? ['docked'] : [], docked: ['departed'] }[state] || []

    return <div key={v.id} className="cw-stack">
      {/* Vessel Header and Status */}
      <section className="cw-card">
        <div className="cw-row">
          <div>
            <h2>{v.name}</h2>
            <p className="cw-muted">{v.id} · Route: {v.source} → {data.port.name}</p>
          </div>
          <Badge>{state}</Badge>
        </div>
        <div className="cw-facts">
          <span><strong>{state.toUpperCase()}</strong>Movement status</span>
          <span><strong>{v.eta_hours != null ? `${v.eta_hours} h` : '—'}</strong>Reported ETA</span>
          <span><strong>{cargo.length}</strong>Consignments aboard</span>
        </div>
      </section>

      {/* Docking Approval (Port Authority) vs Actual Arrival Separation */}
      <section className="cw-card">
        <div className="cw-row">
          <h3>Port Docking Approval & Berth Allocation</h3>
          <Badge>{activeDock ? activeDock.status : 'Not requested'}</Badge>
        </div>
        <p className="cw-muted">Docking approval is allocated strictly by Port Operations. Physical vessel arrival at port waters is recorded independently by the Captain.</p>
        {activeDock ? (
          <div>
            <p>Status: <strong>{activeDock.status.toUpperCase()}</strong> · Port: {data.port.name}</p>
            {activeDock.berth && <p>Assigned Berth: <strong>{activeDock.berth}</strong> · Scheduled Slot: {stamp(activeDock.slot)}</p>}
            {activeDock.status === 'pending' && <p className="cw-muted">Awaiting Port Authority review and berth allocation. Cargo handling capacity confirmed prior to docking approval.</p>}
          </div>
        ) : (
          <ActionForm label="Request docking clearance" submit={f => mutate('/docking-requests', 'POST', { vessel_id: v.id, port_id: data.port.id, eta: iso(f.eta) })}>
            <Field label="Estimated arrival window (your local time)" name="eta" type="datetime-local" />
          </ActionForm>
        )}
      </section>

      {/* Actual Movement Recording */}
      <section className="cw-card">
        <div className="cw-row">
          <h3>Record Actual Vessel Movement</h3>
          <Badge>{state}</Badge>
        </div>
        <p className="cw-muted">Departure notifications are dispatched to logistics companies ONLY when departure is explicitly recorded here, never from planned schedule.</p>
        {events.length > 0 ? (
          <ActionForm label="Record actual milestone" submit={f => mutate(`/vessels/${v.id}/events`, 'POST', { event: f.event, eta_hours: Number(f.eta_hours) })}>
            <Field label="Movement event" name="event" options={events} />
            <Field label="Updated ETA to port (hours)" name="eta_hours" type="number" min="0" step="any" value={v.eta_hours || 0} />
            <p className="cw-muted">Recording 'arrived' marks physical arrival in port waters. Recording 'docked' requires prior Port Authority berth approval.</p>
          </ActionForm>
        ) : (
          <p className="cw-muted">
            {state === 'arrived' && activeDock?.status !== 'approved'
              ? 'Vessel has arrived at port waters. Waiting for Port Operations to approve docking and assign berth before docking can be recorded.'
              : 'No movement transition currently available.'}
          </p>
        )}
      </section>

      {/* Vessel Manifest */}
      <section className="cw-card">
        <div className="cw-row">
          <h3>Vessel Cargo Manifest</h3>
          <span className="cw-badge">{cargo.length} consignments</span>
        </div>
        {!cargo.length ? (
          <p className="cw-muted">No consignments currently assigned to this vessel voyage.</p>
        ) : (
          <div className="cw-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cargo</th>
                  <th>Quantity</th>
                  <th>Target Temp</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Cold Store Reserved</th>
                </tr>
              </thead>
              <tbody>
                {cargo.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.id}</strong></td>
                    <td>{c.cargo}</td>
                    <td>{c.quantity} t</td>
                    <td>{c.requires_cold ? `${c.temperature}°C (Max ${c.max_temperature}°C)` : 'Ambient'}</td>
                    <td>{c.destination}</td>
                    <td><Badge>{c.status}</Badge></td>
                    <td>{c.cold_reserved ? 'Yes (Port Reserved)' : 'Pending / Not needed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Marine Weather & Conditions */}
      <MarineConditions portId={data.port.id} token={token} />

      {/* Vessel Position & Live ETA Update */}
      <section className="cw-card">
        <div className="cw-row">
          <h3>Vessel Navigation Telemetry & ETA Update</h3>
          <Badge>{v.lat != null ? `${v.lat}, ${v.lng}` : 'No GPS'}</Badge>
        </div>
        <div className="split">
          <ActionForm label="Update ETA" submit={f => mutate(`/vessels/${v.id}/eta`, 'PATCH', { eta_hours: Number(f.eta_hours) })}>
            <Field label="Live ETA (hours to port)" name="eta_hours" type="number" min="0" step="any" value={v.eta_hours || 0} />
            <p className="cw-muted">Updates arrival estimate and notifies logistics and port operations.</p>
          </ActionForm>
          <ActionForm label="Update GPS position" submit={f => mutate('/tracking/location', 'POST', { lat: Number(f.lat), lng: Number(f.lng), observed_at: new Date().toISOString() })}>
            <Field label="Latitude" name="lat" type="number" min="-90" max="90" step="any" value={v.lat || 12.92} />
            <Field label="Longitude" name="lng" type="number" min="-180" max="180" step="any" value={v.lng || 74.75} />
            <p className="cw-muted">Broadcasts updated marine AIS/GPS location.</p>
          </ActionForm>
        </div>
      </section>
    </div>
  })}</div>
}

export function Tracking({ data, user, mutate }) {
  return <div className="cw-stack">{['driver', 'captain'].includes(user.role) && <section className="cw-card"><h2>Update your asset position</h2><ActionForm label="Send position" submit={f => mutate('/tracking/location', 'POST', { lat: Number(f.lat), lng: Number(f.lng), observed_at: new Date().toISOString() })}><Field label="Latitude" name="lat" type="number" min="-90" max="90" step="any" /><Field label="Longitude" name="lng" type="number" min="-180" max="180" step="any" /><p>Manual position update for your assigned asset.</p></ActionForm></section>}{[...data.vehicles, ...data.vessels].map(v => <section className="cw-card" key={v.id}><div className="cw-row"><h3>{v.name} · {v.id}</h3><Badge>{v.status}</Badge></div><p>Position: {v.lat}, {v.lng}</p><small>Last reported: {v.last_seen ? stamp(v.last_seen) : 'Seeded position; no update received'}</small></section>)}</div>
}

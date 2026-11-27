import { useState } from 'react'
import AssignmentQR from './AssignmentQR'
import { iso, options, stamp } from '../services/format'
import { ActionButton, ActionForm, Badge, Empty, Field } from './Forms'

const route = f => ({ id: crypto.randomUUID(), name: f.route_name, delay_hours: Number(f.delay || 0), cost: Number(f.cost || 0), risk: Number(f.risk || 0), simulated: true })

function truckDriverName(sh, data) {
  if (!sh.truck_id) return 'No truck'
  const truck = data.vehicles?.find(v => v.id === sh.truck_id)
  if (!truck) return 'Truck ' + sh.truck_id
  const driver = data.users?.find(u => u.id === truck.driver_id)
  return driver ? driver.name : truck.driver_id || 'Not assigned'
}

function slotStatus(sh) {
  // Display slot conflict or slot revision status
  if (!sh.slot_conflict && !sh.slot_timestamp) return 'No slot set'
  if (sh.slot_conflict) return `Conflict: ${sh.slot_conflict}`
  if (sh.slot_timestamp) return `Slot: ${sh.slot_timestamp}`
  return 'Unknown'
}

export default function Cargo({ data, user, mutate }) {
  const [codes, setCodes] = useState({})
  const driverTrucks = data.vehicles.filter(v => v.driver_id)
  async function saveAccess(id, path, method, body) {
    const saved = await mutate(path, method, body)
    setCodes(previous => ({ ...previous, [id]: saved.work_token }))
  }
  const logistics = user.role === 'logistics'
  const portOp = user.role === 'port'
  return <div className="cw-stack">
    {portOp && data.vessels?.length > 0 && (
      <section className="cw-card">
        <h2>Vessel manifests</h2>
        <p className="cw-muted">Cargo manifests for incoming and docked vessels, with unloading and pickup readiness controls.</p>
        <div className="cw-stack">
          {data.vessels.map(v => {
            const manifest = data.shipments.filter(sh => sh.vessel_id === v.id)
            return (
              <div key={v.id} className="cw-card">
                <div className="cw-row">
                  <div><small>{v.id}</small><h3>{v.name}</h3></div>
                  <Badge>{v.movement_status || v.status}</Badge>
                </div>
                <p className="cw-muted">{v.source || 'Source port'} → {data.port.name}{v.eta ? ` · ETA ${v.eta}` : ''}</p>
                {!manifest.length ? <Empty>No consignments on this vessel.</Empty> : (
                  <div className="cw-stack">
                    {manifest.map(sh => (
                      <div key={sh.id} className="cw-row">
                        <div>
                          <strong>{sh.id} · {sh.cargo}</strong>
                          <p className="cw-muted">
                            {sh.quantity} t · {sh.requires_cold ? `Cold chain (${sh.temperature}°C / max ${sh.max_temperature}°C)` : 'Standard handling'} · {sh.origin || 'Source port'} → {sh.destination}
                          </p>
                        </div>
                        <div className="cw-actions">
                          <Badge>{sh.status}</Badge>
                          {['at_port', 'unloaded'].includes(sh.status) && (
                            <ActionButton action={() => mutate(`/shipments/${sh.id}/events`, 'POST', { event: sh.status === 'at_port' ? 'unloaded' : 'ready_for_pickup' })}>
                              {sh.status === 'at_port' ? 'Confirm cargo unloaded' : 'Mark ready for pickup'}
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    )}
    {logistics && <section className="cw-card"><h2>New consignment</h2><p>Register cargo, then request handling and assign a truck.</p>
      <ActionForm label="Create consignment" reset submit={f => mutate('/shipments', 'POST', { cargo: f.cargo, quantity: Number(f.quantity), origin: f.origin, destination: f.destination, port_id: data.port.id, vessel_id: f.vessel_id || null, requires_cold: f.requires_cold === 'yes', temperature: Number(f.temperature), max_temperature: Number(f.max_temperature), eta_hours: Number(f.eta_hours) })}>
        <Field label="Cargo description" name="cargo" maxLength={200} /><Field label="Quantity (tonnes)" name="quantity" type="number" min="0.01" step="any" />
        <Field label="Source" name="origin" /><Field label="Destination" name="destination" />
        <Field label="Vessel ID (optional)" name="vessel_id" required={false} placeholder="e.g. VES-101" />
        <Field label="Refrigeration required" name="requires_cold" options={['no', 'yes']} />
        <Field label="Cargo temperature (°C)" name="temperature" type="number" step="any" value={20} />
        <Field label="Maximum temperature (°C)" name="max_temperature" type="number" step="any" value={25} />
        <Field label="ETA (hours)" name="eta_hours" type="number" min="0" step="any" value={0} />
      </ActionForm></section>}
    {!data.shipments.length && <Empty>No consignments assigned yet.</Empty>}
    {data.shipments.map(sh => <section className="cw-card" key={sh.id}>
      <div className="cw-row"><div><small>{sh.id}</small><h2>{sh.cargo}</h2></div><Badge>{sh.status}</Badge></div>
      <p>{sh.origin || 'Source port'} → {sh.destination}</p>
      <div className="cw-facts"><span><strong>{sh.quantity} t</strong>Cargo quantity</span><span><strong>{sh.eta_hours} h</strong>Estimated arrival</span><span><strong>{sh.requires_cold ? `${sh.temperature}°C / max ${sh.max_temperature}°C` : 'Standard'}</strong>Handling</span><span><strong>{sh.truck_id || 'Unassigned'}</strong>Truck</span>
<span><strong>Driver:</strong> {truckDriverName(sh, data)}</span>
<span><strong>{sh.vessel_id || 'No sea leg'}</strong>Vessel</span></div>
      <p><b>Approved route:</b> {sh.route?.name || sh.route_id || 'Not assigned'}</p>
      {sh.route && <p className="cw-muted">Estimated additional time {sh.route.delay_hours} h · ₹{sh.route.cost || 0} · demo risk {sh.route.risk || 0}/100. Operator-supplied route, not verified navigation.</p>}
      {logistics && !['in_transit', 'delivered'].includes(sh.status) && <details><summary>Assign truck and initial route</summary>
  <div className="cw-row">
    <span>Available company trucks: {(() => {
      const available = data.vehicles?.filter(v => v.company_id === user.company_id) || []
      return available.length ? available.length + ' available' : 'none'
    })()}</span>
    <span>Current assignment: {sh.truck_id || 'None'}</span>
  </div>
  <ActionForm label="Assign truck & route" disabled={!data.vehicles.length} submit={f => saveAccess(sh.id, `/shipments/${sh.id}/assignment`, 'PUT', { truck_id: f.truck_id, route: route(f) })}><Field label="Company truck" name="truck_id" options={options(data.vehicles)} value={sh.truck_id || undefined} /><Field label="Route / instructions" name="route_name" /><p className="cw-muted">Changes during a trip use a reroute request.</p></ActionForm></details>}
      {logistics && sh.truck_id && !driverTrucks.some(v => v.id === sh.truck_id) && sh.status !== 'delivered' &&
        <p>Assign a driver to this truck to enable QR access.</p>}
      {logistics && driverTrucks.some(v => v.id === sh.truck_id) && !['delivered','completed','cancelled','canceled'].includes(sh.status) && <section>
        {codes[sh.id] && <AssignmentQR token={codes[sh.id]} shipment={sh.id} details={{ ...sh, driver: truckDriverName(sh, data) }} />}
        <div className="cw-actions">
          <ActionButton action={() => saveAccess(sh.id, `/shipments/${sh.id}/driver-access?action=issue`, 'POST')}>Issue replacement QR</ActionButton>
          <ActionButton action={() => saveAccess(sh.id, `/shipments/${sh.id}/driver-access?action=revoke`, 'POST')}>Revoke driver QR</ActionButton>
        </div>
      </section>}
      {logistics && !['in_transit', 'delivered'].includes(sh.status) && <details open><summary>Request slot revision</summary>
        <p>Slot conflict: {slotStatus(sh)}</p>
        <ActionForm label="Request slot revision" submit={f => mutate(`/shipments/${sh.id}/slot-revision`, 'POST', { slot_timestamp: f.slot_timestamp })}><Field label="Slot timestamp (UTC ISO)" name="slot_timestamp" type="text" placeholder="e.g. 2026-12-01T10:00:00Z" /></ActionForm>
        {sh.slot_conflict && <p className="cw-muted small">Conflict detected: {sh.slot_conflict}</p>}
      </details>}
      {logistics && sh.status !== 'delivered' && <details><summary>Request port handling or truck access</summary><ActionForm label="Send port request" submit={f => mutate('/port-requests', 'POST', { shipment_id: sh.id, kind: f.kind, requested_at: iso(f.time) })}><Field label="Request type" name="kind" options={sh.truck_id ? ['handling', 'truck_access'] : ['handling']} /><Field label="Requested time (your local time)" name="time" type="datetime-local" /></ActionForm></details>}
      {['driver', 'logistics'].includes(user.role) && sh.status !== 'delivered' && <details><summary>Request a route change</summary>{data.requests.some(r => r.shipment_id === sh.id && r.status === 'pending') ? <p>A route change is awaiting logistics approval. See Requests.</p> : <ActionForm label="Submit reroute request" submit={f => mutate('/route-requests', 'POST', { shipment_id: sh.id, reason: f.reason, options: [route(f)] })}><Field label="Reason for changing route" name="reason" minLength={3} /><Field label="Proposed route / instructions" name="route_name" /><Field label="Additional time (hours)" name="delay" type="number" min="0" step="any" value={0} /><Field label="Estimated additional cost (₹)" name="cost" type="number" min="0" value={0} /><Field label="Estimated risk index (0–100)" name="risk" type="number" min="0" max="100" value={0} /><p className="cw-muted">Your proposal becomes active only after logistics approval.</p></ActionForm>}</details>}
      {user.role === 'port' && ['at_port', 'unloaded'].includes(sh.status) && <ActionButton action={() => mutate(`/shipments/${sh.id}/events`, 'POST', { event: sh.status === 'at_port' ? 'unloaded' : 'ready_for_pickup' })}>{sh.status === 'at_port' ? 'Confirm cargo unloaded' : 'Mark ready for pickup'}</ActionButton>}
      {user.role === 'driver' && ['ready_for_pickup', 'in_transit'].includes(sh.status) && <ActionButton disabled={sh.status === 'ready_for_pickup' && !data.port_requests.some(r => r.shipment_id === sh.id && r.kind === 'truck_access' && r.status === 'approved' && r.truck_id === sh.truck_id)} action={() => mutate(`/shipments/${sh.id}/events`, 'POST', { event: sh.status === 'ready_for_pickup' ? 'picked_up' : 'delivered' })}>{sh.status === 'ready_for_pickup' ? 'Confirm pickup (access approval required)' : 'Confirm delivery'}</ActionButton>}
      {/* Unified consignment history — sea / port / road */}
      <details><summary>Consignment history ({sh.history?.length || 0})</summary>
        {sh.history?.length ? (
          <ol>
            {sh.history.map(ev => {
              const etype = ev.event.replaceAll('_', ' ').trim();
              const ts = stamp(ev.created_at);
              const actor = ev.actor ? ` · ${ev.actor}` : '';
              const detail = ev.details && Object.keys(ev.details).length ? (
                <div className="cw-muted tiny">{JSON.stringify(ev.details)}</div>
              ) : null;
              return <li key={ev.id}>{etype}{actor}{ts}{detail}</li>;
            })}
          </ol>
        ) : (
          <Empty>No movement events recorded.</Empty>
        )}</details>

      {logistics && sh.eligibility && <details open><summary>Pickup eligibility</summary>
        <p>Unloaded: {sh.eligibility.unloaded ? 'Yes' : 'No'} · Ready: {sh.eligibility.ready_for_pickup ? 'Yes' : 'No'} · Truck access: {sh.eligibility.truck_access_approved ? 'Approved' : 'Not approved'}</p>
        <p>{sh.eligibility.pickup_allowed ? 'Pickup is allowed.' : sh.eligibility.blocked_reason}</p>
      </details>}

      {/* Sea / port / road linkage summary */}
      {sh.vessel_id || sh.route_id || sh.truck_id ? (
        <div className="cw-card">
          <div className="cw-row">
            {sh.vessel_id && <span><strong>Vessel:</strong> {sh.vessel_id}</span>}
            {sh.truck_id && <span><strong>Truck:</strong> {sh.truck_id}</span>}
            {sh.truck_id && <span><strong>Driver:</strong> {truckDriverName(sh, data)}</span>}
            {sh.route_id && <span><strong>Route:</strong> {sh.route_id} {sh.route_name ? `· ${sh.route_name}` : ''}</span>}
            {sh.slot_timestamp && <span><strong>Slot:</strong> {sh.slot_timestamp}</span>}
          </div>
          {sh.port_id && <p><strong>Handling port:</strong> {sh.port_id}</p>}
          {sh.origin && <p><strong>Origin:</strong> {sh.origin}</p>}
          {sh.destination && <p><strong>Destination:</strong> {sh.destination}</p>}
          {sh.slot_conflict && <p className="cw-error"><strong>Slot conflict:</strong> {sh.slot_conflict}</p>}
        </div>
      ) : (
        <p className="cw-muted">Not assigned: no vessel, truck, or route.</p>
      )}
    </section>)}
  </div>
}

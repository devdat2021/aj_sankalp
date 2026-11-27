import { iso, stamp } from '../services/format'
import { ActionForm, Badge, Empty, Field } from './Forms'

function Decision({ row, type, mutate, berths }) {
  return <ActionForm label="Record decision" submit={f => {
    const body = { status: f.status, reason: f.reason }
    if (f.status === 'approved') {
      if (type === 'route-requests') {
        if (!row.options.some(o => o.id === f.option_id)) throw new Error('Choose a route option to approve.');
        body.option_id = f.option_id
      }
      else { if (!f.slot) throw new Error('Choose an approved time.'); body.slot = iso(f.slot) }
      if (type === 'docking-requests') { if (!f.berth) throw new Error('Choose a berth.'); body.berth = f.berth }
    }
    return mutate(`/${type}/${row.id}`, 'PATCH', body)
  }}>
    <Field label="Decision" name="status" options={['approved', 'rejected']} />
    <Field label="Reason" name="reason" minLength={3} maxLength={500} />
    {type === 'route-requests' ? <Field label="Route option (for approval)" name="option_id" required={false} options={[{ value: '', label: 'Choose a proposed route' }, ...row.options.map(o => ({ value: o.id, label: `${o.name} · +${o.delay_hours} h · ₹${o.cost || 0}` }))]} /> : <Field label="Approved time (required for approval)" name="slot" type="datetime-local" required={false} />}
    {type === 'docking-requests' && <Field label="Compatible berth (required for approval)" name="berth" required={false} options={[{ value: '', label: 'Select berth' }, ...Array.from({ length: berths }, (_, i) => `B${i + 1}`)]} />}
  </ActionForm>
}

function RouteReview({ row, shipment }) {
  const selected = row.options.find(o => o.id === row.option_id)
  return <div>
    <p>Submitted: {stamp(row.created_at)} · Truck: {row.truck_id || shipment?.truck_id || 'Unassigned'}</p>
    <p>Current approved route: {shipment?.route?.name || shipment?.route_id || 'Not assigned'} · Current cargo ETA: {shipment?.eta_hours ?? 'Unknown'} hours</p>
    <p>Proposal baseline: {row.base_route?.name || ('assignment_version' in row ? 'No approved route recorded' : 'Legacy request; no baseline snapshot')}</p>
    <table><thead><tr><th>Proposed route</th><th>Additional delay</th><th>Cost estimate</th><th>Risk estimate</th><th>ETA if approved now</th></tr></thead><tbody>
      {row.options.map(o => <tr key={o.id}><td>{o.name}{row.option_id === o.id ? ' (selected)' : ''}<small> · {o.source || 'Operator estimate'}</small></td><td>{o.delay_hours} h</td><td>₹{o.cost ?? 0}</td><td>{o.risk ?? 0}/100</td><td>{row.status === 'pending' && shipment ? `${Number(shipment.eta_hours) + Number(o.delay_hours)} h` : '—'}</td></tr>)}
    </tbody></table>
    <p className="cw-muted">Estimates require logistics review. A proposal does not change the active route. ETA is a relative cargo estimate; no delivery or pickup slot is rescheduled here.</p>
    {row.status === 'approved' && <p>Approved route: {selected?.name || row.option_id}{row.eta_after_hours != null && ` · Recorded ETA: ${row.eta_before_hours} → ${row.eta_after_hours} h`}</p>}
    {row.status === 'rejected' && <p>Proposal rejected; this decision did not change the approved route or ETA.</p>}
    {row.decision_reason && <p>Decision reason: {row.decision_reason}</p>}
    {row.superseded_reason && <p role="status">{row.superseded_reason}</p>}
  </div>
}

export default function Requests({ data, user, mutate }) {
  const groups = [
    { title: 'Port handling & truck access', key: 'port_requests', type: 'port-requests', owner: 'port' },
    { title: 'Road route changes', key: 'requests', type: 'route-requests', owner: 'logistics' },
    ...(['port', 'captain'].includes(user.role) ? [{ title: 'Vessel docking', key: 'docking_requests', type: 'docking-requests', owner: 'port' }] : []),
  ]
  return <div className="cw-stack">{groups.map(group => <section key={group.key}><h2>{group.title}</h2><p className="cw-muted">Decision owner: {group.owner === 'port' ? 'Port Operations' : 'Logistics company'}</p>
    {!data[group.key].length && <Empty>No requests yet.</Empty>}
    {[...data[group.key]].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || (b.priority || 0) - (a.priority || 0)).map(row => <article className="cw-card" key={row.id}>
      <div className="cw-row"><h3>{row.shipment_id || row.vessel_id} · {row.kind?.replaceAll('_', ' ') || row.priority_reason || 'Reroute'}</h3><Badge>{row.status}</Badge></div>
      <small>{row.id}</small>{row.reason && <p>{row.reason}</p>}
      {row.requested_at && <p>Requested: {stamp(row.requested_at)}</p>}{row.eta && <p>Vessel ETA: {stamp(row.eta)}</p>}
      {row.options && <RouteReview row={row} shipment={data.shipments.find(s => s.id === row.shipment_id)} />}
      {row.status === 'pending' && user.role === group.owner ? <Decision row={row} type={group.type} mutate={mutate} berths={data.port.berths} /> : row.status === 'pending' ? <p>Awaiting {group.owner === 'port' ? 'port' : 'logistics'} review.</p> : <p>Reviewed {stamp(row.reviewed_at)}{row.slot ? ` · Slot: ${stamp(row.slot)}` : ''}{row.berth ? ` · Berth ${row.berth}` : ''}</p>}
    </article>)}
  </section>)}</div>
}

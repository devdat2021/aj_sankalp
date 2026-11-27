import { iso, stamp } from '../services/format'
import { ActionForm, Badge, Empty, Field } from './Forms'

function Decision({ row, type, mutate, berths }) {
  return <ActionForm label="Record decision" submit={f => {
    const body = { status: f.status, reason: f.reason }
    if (f.status === 'approved') {
      if (type === 'route-requests') body.option_id = f.option_id
      else { if (!f.slot) throw new Error('Choose an approved time.'); body.slot = iso(f.slot) }
      if (type === 'docking-requests') { if (!f.berth) throw new Error('Choose a berth.'); body.berth = f.berth }
    }
    return mutate(`/${type}/${row.id}`, 'PATCH', body)
  }}>
    <Field label="Decision" name="status" options={['approved', 'rejected']} />
    <Field label="Reason" name="reason" minLength={3} maxLength={500} />
    {type === 'route-requests' ? <Field label="Route option (for approval)" name="option_id" options={row.options.map(o => ({ value: o.id, label: `${o.name} · +${o.delay_hours} h · ₹${o.cost || 0}` }))} /> : <Field label="Approved time (required for approval)" name="slot" type="datetime-local" required={false} />}
    {type === 'docking-requests' && <Field label="Compatible berth (required for approval)" name="berth" required={false} options={[{ value: '', label: 'Select berth' }, ...Array.from({ length: berths }, (_, i) => `B${i + 1}`)]} />}
  </ActionForm>
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
      {row.options?.map(o => <p key={o.id}>{o.name} · +{o.delay_hours} h · ₹{o.cost || 0} · estimated risk {o.risk || 0}/100</p>)}
      {row.status === 'pending' && user.role === group.owner ? <Decision row={row} type={group.type} mutate={mutate} berths={data.port.berths} /> : row.status === 'pending' ? <p>Awaiting {group.owner === 'port' ? 'port' : 'logistics'} review.</p> : <p>Reviewed {stamp(row.reviewed_at)}{row.slot ? ` · Slot: ${stamp(row.slot)}` : ''}{row.berth ? ` · Berth ${row.berth}` : ''}</p>}
    </article>)}
  </section>)}</div>
}

import { useState } from 'react'
import { iso, stamp } from '../services/format'
import { ActionForm, Badge, Empty, Field } from './Forms'

function Decision({ row, type, mutate, berths, compatibleBerths }) {
  const [status, setStatus] = useState('approved')
  const showSlotSuggest = type !== 'route-requests' && status === 'slot_suggested'
  const statusOptions = type === 'route-requests'
    ? ['approved', 'rejected']
    : [
        { value: 'approved', label: 'Approve' },
        { value: 'slot_suggested', label: 'Suggest alternative slot' },
        { value: 'rejected', label: 'Reject' },
      ]

  return <ActionForm label="Record decision" submit={f => {
    const body = { status: f.status, reason: f.reason }
    if (f.status === 'approved') {
      if (type === 'route-requests') body.option_id = f.option_id
      else {
        if (!f.slot) throw new Error('Choose an approved time.')
        body.slot = iso(f.slot)
      }
      if (type === 'docking-requests') {
        if (!f.berth) throw new Error('Choose a berth.')
        body.berth = f.berth
      }
    } else if (f.status === 'slot_suggested') {
      if (!f.suggested_start || !f.suggested_end) throw new Error('Choose both start and end times for the suggested window.')
      if (new Date(f.suggested_end) <= new Date(f.suggested_start)) throw new Error('Suggested end time must be after start time.')
      body.suggested_start = iso(f.suggested_start)
      body.suggested_end = iso(f.suggested_end)
    }
    return mutate(`/${type}/${row.id}`, 'PATCH', body)
  }}>
    <Field label="Decision" name="status" options={statusOptions} value={status} onChange={e => setStatus(e.target.value)} />
    <Field label="Reason" name="reason" minLength={3} maxLength={500} />
    {type === 'route-requests' ? (
      <Field label="Route option (for approval)" name="option_id" options={row.options.map(o => ({ value: o.id, label: `${o.name} · +${o.delay_hours} h · ₹${o.cost || 0}` }))} />
    ) : showSlotSuggest ? (
      <>
        <Field label="Suggested window start" name="suggested_start" type="datetime-local" />
        <Field label="Suggested window end" name="suggested_end" type="datetime-local" />
      </>
    ) : status === 'approved' ? (
      <Field label="Approved time (required for approval)" name="slot" type="datetime-local" required={false} />
    ) : null}
    {type === 'docking-requests' && status === 'approved' && (
      <Field
        label="Compatible berth (required for approval)"
        name="berth"
        required={false}
        options={[
          { value: '', label: 'Select berth' },
          ...Array.from({ length: berths }, (_, i) => {
            const b = `B${i + 1}`
            const isCompat = !compatibleBerths || compatibleBerths.includes(b)
            return { value: b, label: isCompat ? `${b} (Compatible)` : `${b} (Incompatible / Reserved)` }
          }),
        ]}
      />
    )}
  </ActionForm>
}

export default function Requests({ data, user, mutate }) {
  const groups = [
    ...(['port', 'logistics', 'driver'].includes(user.role) ? [{ title: 'Port handling & truck access', key: 'port_requests', type: 'port-requests', owner: 'port' }] : []),
    ...(['logistics', 'driver'].includes(user.role) ? [{ title: 'Road route changes', key: 'requests', type: 'route-requests', owner: 'logistics' }] : []),
    ...(['port', 'captain'].includes(user.role) ? [{ title: 'Vessel docking', key: 'docking_requests', type: 'docking-requests', owner: 'port' }] : []),
  ]
  return <div className="cw-stack">{groups.map(group => <section key={group.key}><h2>{group.title}</h2><p className="cw-muted">Decision owner: {group.owner === 'port' ? 'Port Operations' : 'Logistics company'}</p>
    {!data[group.key].length && <Empty>No requests yet.</Empty>}
    {[...data[group.key]].sort((a, b) => {
      const aOpen = Number(['pending', 'slot_suggested'].includes(a.status))
      const bOpen = Number(['pending', 'slot_suggested'].includes(b.status))
      if (bOpen !== aOpen) return bOpen - aOpen
      return (b.priority_score ?? b.priority ?? 0) - (a.priority_score ?? a.priority ?? 0)
    }).map(row => <article className="cw-card" key={row.id}>
      <div className="cw-row">
        <h3>
          {group.type === 'docking-requests' && row.recommended_order ? `#${row.recommended_order} · ` : ''}
          {row.shipment_id || row.vessel_id} · {row.kind?.replaceAll('_', ' ') || row.priority_reason || 'Reroute'}
        </h3>
        <div className="cw-actions">
          {group.type === 'docking-requests' && typeof row.priority_score === 'number' && (
            <Badge>Score {row.priority_score}/100</Badge>
          )}
          {group.type === 'docking-requests' && typeof row.eligible_for_approval === 'boolean' && ['pending', 'slot_suggested'].includes(row.status) && (
            <Badge>{row.eligible_for_approval ? 'eligible' : 'blocked'}</Badge>
          )}
          <Badge>{row.status}</Badge>
        </div>
      </div>
      <small>{row.id}</small>{row.reason && <p>{row.reason}</p>}
      {row.requested_at && <p><b>Original requested time:</b> {stamp(row.requested_at)}</p>}
      {row.eta && <p><b>Original vessel ETA:</b> {stamp(row.eta)}</p>}
      {row.suggested_start && row.suggested_end && (
        <p><b>Suggested alternative window:</b> {stamp(row.suggested_start)} → {stamp(row.suggested_end)}</p>
      )}
      {group.type === 'docking-requests' && row.priority_reason && (
        <p className="cw-muted"><b>Priority factors:</b> {row.priority_reason}</p>
      )}
      {group.type === 'docking-requests' && row.constraints?.length > 0 && (
        <p className="cw-error" role="status"><b>Operational constraints:</b> {row.constraints.join(' · ')}</p>
      )}
      {row.options?.map(o => <p key={o.id}>{o.name} · +{o.delay_hours} h · ₹{o.cost || 0} · estimated risk {o.risk || 0}/100</p>)}
      {['pending', 'slot_suggested'].includes(row.status) && user.role === group.owner ? (
        <Decision row={row} type={group.type} mutate={mutate} berths={data.port.berths} compatibleBerths={row.compatible_berths} />
      ) : ['pending', 'slot_suggested'].includes(row.status) ? (
        <p>Awaiting {group.owner === 'port' ? 'port' : 'logistics'} review.</p>
      ) : (
        <p>Reviewed {stamp(row.reviewed_at)}{row.slot ? ` · Slot: ${stamp(row.slot)}` : ''}{row.berth ? ` · Berth ${row.berth}` : ''}</p>
      )}
    </article>)}
  </section>)}</div>
}

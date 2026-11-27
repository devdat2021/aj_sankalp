import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { intelligenceErrorMessage } from '../services/intelligenceErrors'

const localDate = value => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function ErrorDetails({ error }) {
  if (!error) return null
  return <details>
    <summary>Technical details</summary>
    <p>{error.status ? `HTTP ${error.status}. ` : ''}{error.message || 'No additional details.'}</p>
  </details>
}

function InputMessage({ message, error }) {
  return <>
    {error && <p role="alert" className="cw-error">{intelligenceErrorMessage(error)}</p>}
    {message && <p role="status" className="cw-success">{message}</p>}
    <ErrorDetails error={error}/>
  </>
}

export default function IntelligenceInputs({ shipment, token, role, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const formRef = useRef(null)
  const dirty = useRef(false)
  const port = role === 'port'
  const dates = port
    ? [['cargo_ready_at', 'Expected cargo readiness'], ['pickup_window_start', 'Pickup window starts'], ['pickup_window_end', 'Pickup window ends']]
    : [['delivery_deadline', 'Delivery deadline'], ['planned_pickup_at', 'Current planned pickup'], ['planned_delivery_at', 'Current planned delivery']]
  const numbers = port
    ? [['pickup_service_seconds', 'Pickup service time (seconds)']]
    : [['weight_kg', 'Cargo weight (kg)'], ['delivery_service_seconds', 'Delivery service time (seconds)']]
  const inputSnapshot = JSON.stringify([
    shipment.id,
    ...dates.map(([key]) => shipment[key] ?? ''),
    ...numbers.map(([key]) => shipment[key] ?? ''),
    ...(!port ? ['pickup', 'delivery'].flatMap(key => [shipment[key]?.lat ?? '', shipment[key]?.lng ?? '']) : [])
  ])

  useEffect(() => {
    if (!dirty.current) formRef.current?.reset()
  }, [inputSnapshot])

  async function save(event) {
    event.preventDefault()
    setBusy(true); setMessage(''); setError(null)
    const form = new FormData(event.currentTarget), body = {}
    for (const [key] of dates) if (form.get(key)) body[key] = new Date(form.get(key)).toISOString()
    for (const [key] of numbers) if (form.get(key) !== '') body[key] = Number(form.get(key))
    if (!port) for (const key of ['pickup', 'delivery']) {
      if (form.get(key + '_lat') !== '' && form.get(key + '_lng') !== '') body[key] = { lat: Number(form.get(key + '_lat')), lng: Number(form.get(key + '_lng')) }
    }
    try {
      await api(`/intelligence/shipments/${shipment.id}/inputs`, token, 'PATCH', body)
      dirty.current = false
      await onSaved?.()
      setMessage('Confirmed shipment inputs saved. Analysis is queued when enabled.')
    } catch (err) {
      setError(err)
    } finally { setBusy(false) }
  }

  return <details>
    <summary>{port ? 'Confirm cargo readiness and pickup window' : 'Update transport planning inputs'} · {shipment.id}</summary>
    <form ref={formRef} onChangeCapture={() => { dirty.current = true }} onSubmit={save} className="cw-form">
      <fieldset disabled={busy}>
        <p>Enter confirmed operational information only. Times use your local timezone and are submitted with timezone information; empty fields remain unknown.</p>
        {dates.map(([key, label]) => <label className="cw-field" key={key}>{label}<input name={key} type="datetime-local" defaultValue={localDate(shipment[key])}/></label>)}
        {numbers.map(([key, label]) => <label className="cw-field" key={key}>{label}<input name={key} type="number" min={key === 'weight_kg' ? 0.001 : 0} step={key === 'weight_kg' ? 'any' : '1'} defaultValue={shipment[key] ?? ''}/></label>)}
        {!port && ['pickup', 'delivery'].map(key => <fieldset key={key}><legend>{key === 'pickup' ? 'Pickup coordinates' : 'Delivery coordinates'}</legend>{['lat', 'lng'].map(axis => <label className="cw-field" key={axis}>{axis === 'lat' ? 'Latitude' : 'Longitude'}<input name={`${key}_${axis}`} type="number" min={axis === 'lat' ? -90 : -180} max={axis === 'lat' ? 90 : 180} step="any" defaultValue={shipment[key]?.[axis] ?? ''}/></label>)}</fieldset>)}
        <button className="cw-primary" type="submit">{busy ? 'Saving…' : 'Save confirmed inputs'}</button>
      </fieldset>
      <InputMessage message={message} error={error}/>
    </form>
  </details>
}

function VehicleForm({ vehicle, token, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(null)
  const formRef = useRef(null)
  const dirty = useRef(false)
  const inputSnapshot = JSON.stringify([
    vehicle.available, vehicle.refrigerated, vehicle.capacity_kg, vehicle.available_from,
    vehicle.available_until, vehicle.cost_per_hour, vehicle.cost_per_km, vehicle.cost_currency,
    vehicle.start?.lat, vehicle.start?.lng
  ])

  useEffect(() => {
    if (!dirty.current) formRef.current?.reset()
  }, [inputSnapshot])

  async function save(event) {
    event.preventDefault()
    setBusy(true); setMessage(''); setError(null)
    const form = new FormData(event.currentTarget)
    const body = {
      available: form.get('available') === 'true',
      refrigerated: form.get('refrigerated') === 'true',
      capacity_kg: Number(form.get('capacity_kg')),
      available_from: new Date(form.get('available_from')).toISOString(),
      available_until: new Date(form.get('available_until')).toISOString(),
      cost_per_hour: Number(form.get('cost_per_hour')),
      cost_per_km: Number(form.get('cost_per_km')),
      cost_currency: String(form.get('cost_currency')).trim().toUpperCase(),
      start: { lat: Number(form.get('start_lat')), lng: Number(form.get('start_lng')) }
    }
    try {
      await api(`/intelligence/vehicles/${vehicle.id}/inputs`, token, 'PATCH', body)
      dirty.current = false
      await onSaved?.()
      setMessage('Confirmed fleet inputs saved. Affected analyses are queued when enabled.')
    } catch (err) {
      setError(err)
    } finally { setBusy(false) }
  }

  return <details>
    <summary>{vehicle.name || vehicle.id} · {vehicle.available === true ? 'availability confirmed' : vehicle.available === false ? 'unavailable' : 'availability unknown'}</summary>
    <form ref={formRef} onChangeCapture={() => { dirty.current = true }} onSubmit={save} className="cw-form">
      <fieldset disabled={busy}>
        <p>Set the vehicle’s real availability, capacity and cost inputs. Unknown values must be confirmed before optimization.</p>
        <label className="cw-field">Vehicle available
          <select name="available" required defaultValue={vehicle.available === true ? 'true' : vehicle.available === false ? 'false' : ''}>
            <option value="" disabled>Select confirmed availability</option><option value="true">Available</option><option value="false">Unavailable</option>
          </select>
        </label>
        <label className="cw-field">Refrigeration capability
          <select name="refrigerated" required defaultValue={vehicle.refrigerated === true ? 'true' : vehicle.refrigerated === false ? 'false' : ''}>
            <option value="" disabled>Select confirmed capability</option><option value="true">Refrigerated</option><option value="false">Not refrigerated</option>
          </select>
        </label>
        <label className="cw-field">Capacity (kg)<input name="capacity_kg" type="number" min="0.001" step="any" required defaultValue={vehicle.capacity_kg ?? ''}/></label>
        <label className="cw-field">Availability starts<input name="available_from" type="datetime-local" required defaultValue={localDate(vehicle.available_from)}/></label>
        <label className="cw-field">Availability ends<input name="available_until" type="datetime-local" required defaultValue={localDate(vehicle.available_until)}/></label>
        <label className="cw-field">Cost per hour<input name="cost_per_hour" type="number" min="0.001" step="any" required defaultValue={vehicle.cost_per_hour ?? ''}/></label>
        <label className="cw-field">Cost per kilometre<input name="cost_per_km" type="number" min="0" step="any" required defaultValue={vehicle.cost_per_km ?? ''}/></label>
        <label className="cw-field">Cost currency<input name="cost_currency" type="text" minLength="3" maxLength="3" pattern="[A-Za-z]{3}" required defaultValue={vehicle.cost_currency ?? ''} placeholder="e.g. INR"/></label>
        <fieldset><legend>Confirmed starting coordinates</legend>
          <label className="cw-field">Latitude<input name="start_lat" type="number" min="-90" max="90" step="any" required defaultValue={vehicle.start?.lat ?? ''}/></label>
          <label className="cw-field">Longitude<input name="start_lng" type="number" min="-180" max="180" step="any" required defaultValue={vehicle.start?.lng ?? ''}/></label>
        </fieldset>
        <button className="cw-primary" type="submit">{busy ? 'Saving…' : 'Save fleet inputs'}</button>
      </fieldset>
      <InputMessage message={message} error={error}/>
    </form>
  </details>
}

export function FleetInputs({ vehicles = [], token, onSaved }) {
  if (!vehicles.length) return <p className="cw-empty">No company fleet records are available in this workspace.</p>
  return <section aria-label="Fleet planning inputs">
    <h3>Fleet availability and capacity</h3>
    <p className="cw-muted">Only vehicles in your company scope are listed. Confirm a vehicle’s dated availability, capacity, refrigeration, costs and starting position before requesting optimization.</p>
    <div className="cw-stack">{vehicles.map(vehicle => <VehicleForm key={vehicle.id} vehicle={vehicle} token={token} onSaved={onSaved}/>)}</div>
  </section>
}

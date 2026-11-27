import { useState } from 'react'
import Modal from './Modal'
export default function IncidentModal({ driverApi, shipment, location, onClose, onReported }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget))
    try { const incident = await driverApi.reportIncident(values, shipment); onReported(incident); onClose() }
    catch (err) { setError(err.message); setBusy(false) }
  }
  return <Modal title="Report an incident & hazard" onClose={onClose} busy={busy}><p className="muted">Report to your logistics company and port operations. Hazard reports halt the trip. Delay reports update logistics.</p>
    <form onSubmit={submit} className="incident-form"><label>Incident & hazard type<select name="type"><option value="delay">Delivery delay</option><option value="Flooding">Flooding (Flood hazard)</option><option value="Roadblock">Roadblock / Road closure</option><option value="Road obstruction">Road obstruction</option><option value="Vehicle breakdown">Vehicle breakdown</option><option value="Refrigeration failure">Refrigeration failure</option><option value="Distress signal">Emergency SOS / Distress</option><option value="Other issue">Other operational issue</option></select></label>
      <label>Severity<select name="severity" defaultValue="critical"><option value="critical">Critical / Route blocked</option><option value="warning">Warning / Severe hazard</option><option value="info">Low / Advisory</option></select></label>
      <label>Location (latitude, longitude)<input name="location" required maxLength={200} defaultValue={location} placeholder="e.g. 13.0250, 74.7950"/></label>
      <label>Description & safety status<textarea name="description" required minLength={5} maxLength={1000} rows={4} placeholder="Describe hazard details, safety status, and assistance needed…"/></label>
      <p className="fine-print">For hazards, the vehicle will enter "Stopped / Unable to continue" state until an approved detour is cleared.</p>{error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button></div>
    </form></Modal>
}

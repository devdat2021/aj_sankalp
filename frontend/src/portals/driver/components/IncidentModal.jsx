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
  return <Modal title="Report an incident" onClose={onClose} busy={busy}><p className="muted">Report to your logistics company and port operations.</p>
    <form onSubmit={submit} className="incident-form"><label>Incident type<select name="type"><option>Vehicle breakdown</option><option>Flooding</option><option>Road obstruction</option><option>Refrigeration failure</option><option>Other issue</option></select></label>
      <label>Severity<select name="severity" defaultValue="warning"><option value="info">Low</option><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
      <label>Location<input name="location" required maxLength={200} defaultValue={location}/></label>
      <label>Description<textarea name="description" required minLength={5} maxLength={1000} rows={4} placeholder="Describe the issue and assistance needed…"/></label>
      <p className="fine-print">Submission time is recorded automatically.</p>{error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button></div>
    </form></Modal>
}

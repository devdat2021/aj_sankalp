import { useState } from 'react'
import { Siren } from 'lucide-react'
import Modal from './Modal'
export default function DistressButton({ driverApi, shipment, location, onReported }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send() {
    setBusy(true); setError('')
    try { onReported(await driverApi.sendDistress(location, shipment)); setOpen(false) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <><button className="sos-button" onClick={() => setOpen(true)}><Siren size={19}/> SOS <span>Demo</span></button>{open && <Modal title="Send a demo distress signal?" onClose={() => setOpen(false)} busy={busy}>
    <div className="distress-notice"><Siren size={30}/><strong>This is not a real emergency service.</strong><p>This saves a critical incident and notifies the relevant company and port users. It does not call an emergency service.</p></div>
    <p className="muted">Reported location: {location}</p>{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button onClick={() => setOpen(false)} disabled={busy}>Cancel</button><button className="sos-button" onClick={send} disabled={busy}>{busy ? 'Creating signal…' : 'Confirm demo SOS'}</button></div>
  </Modal>}</>
}

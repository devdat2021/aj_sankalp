import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
export default function Modal({ title, onClose, children, busy = false }) {
  const ref = useRef(null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="driver-dialog" aria-labelledby="driver-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <div className="section-heading"><h2 id="driver-dialog-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={20}/></button></div>{children}
  </dialog>
}

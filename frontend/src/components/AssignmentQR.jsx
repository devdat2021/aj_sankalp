import { useRef } from 'react'
import { ActionButton } from './Forms'
import { QRCodeSVG } from 'qrcode.react'

export default function AssignmentQR({ token, shipment, details = {} }) {
  const qr = useRef(null)
  const url = new URL('/driver/work', window.location.origin)
  if (import.meta.env.PROD && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) url.protocol = 'https:'
  url.hash = token
  async function shareWhatsApp() {
    const summary = [
      'CoastWatch Driver Assignment',
      `Driver: ${details.driver || 'Assigned driver'}`,
      `Truck: ${details.truck_id || 'See assignment'}`,
      `Shipment: ${shipment}`,
      `${details.origin || 'Pickup'} → ${details.destination || 'Destination'}`,
      `Cargo: ${details.cargo || 'See manifest'}`,
      'Open your workspace to view your route and delivery.'
    ].join('\n')
    if (navigator.share && window.innerWidth < 768) {
      try { await navigator.share({ title: 'CoastWatch Driver Assignment', text: summary, url: url.href }) }
      catch (error) { if (error.name !== 'AbortError') throw error }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(summary + '\n' + url.href)}`, '_blank', 'noopener,noreferrer')
    }
  }
  function download() {
    const svg = new XMLSerializer().serializeToString(qr.current)
    const blob = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.download = `driver-${shipment}.svg`
    link.href = blob
    link.click()
    setTimeout(() => URL.revokeObjectURL(blob), 1000)
  }
  function print() {
    const page = window.open('', '_blank', 'width=480,height=520')
    if (!page) throw new Error('Allow the print window to open.')
    page.opener = null
    page.document.title = 'Driver assignment ' + shipment
    const title = page.document.createElement('h1')
    title.textContent = shipment
    page.document.body.append(title, qr.current.cloneNode(true))
    page.print()
  }
  return <div><h3>Driver access · {shipment}</h3>
    <QRCodeSVG ref={qr} value={url.href} size={220} marginSize={4} title="Scan to open assigned work" />
    <div className="cw-actions"><span className="whatsapp-action"><ActionButton action={shareWhatsApp}>Share via WhatsApp</ActionButton></span><button onClick={download}>Download QR</button><ActionButton action={print}>Print QR</ActionButton></div>
  </div>
}

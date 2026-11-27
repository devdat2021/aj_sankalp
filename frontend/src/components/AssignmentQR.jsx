import { useRef } from 'react'
import { ActionButton } from './Forms'
import { QRCodeSVG } from 'qrcode.react'

export default function AssignmentQR({ token, shipment }) {
  const qr = useRef(null)
  const url = new URL('/driver/work', window.location.origin)
  if (import.meta.env.PROD && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) url.protocol = 'https:'
  url.hash = token
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
    <div className="cw-actions"><button onClick={download}>Download QR</button><ActionButton action={print}>Print QR</ActionButton></div>
  </div>
}

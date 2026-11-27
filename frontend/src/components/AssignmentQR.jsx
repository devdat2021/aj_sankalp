import { useRef, useState } from 'react'
import { ActionButton } from './Forms'
import { QRCodeSVG } from 'qrcode.react'

async function qrToPngBlob(svgElement, labelText) {
  const svgData = new XMLSerializer().serializeToString(svgElement)
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = svgUrl
    })
    const pad = 24
    const footer = labelText ? 34 : 0
    const canvas = document.createElement('canvas')
    canvas.width = img.width + pad * 2
    canvas.height = img.height + pad * 2 + footer
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, pad, pad)
    if (labelText) {
      ctx.fillStyle = '#142f42'
      ctx.font = 'bold 14px Inter, Segoe UI, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(labelText, canvas.width / 2, img.height + pad + 22)
    }
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to generate QR image'))), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

export default function AssignmentQR({ token, shipment, details = {} }) {
  const qr = useRef(null)
  const [shareNote, setShareNote] = useState('')
  const url = new URL('/driver/work', window.location.origin)
  if (import.meta.env.PROD && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) url.protocol = 'https:'
  url.hash = token
  const label = [shipment, details.truck_id].filter(Boolean).join(' · ')

  async function shareWhatsApp() {
    setShareNote('')
    const blob = await qrToPngBlob(qr.current, label)
    const file = new File([blob], `driver-${shipment}.png`, { type: 'image/png' })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `CoastWatch QR · ${shipment}` })
        return
      } catch (error) {
        if (error.name === 'AbortError') return
      }
    }

    let copied = false
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        copied = true
      } catch {
        copied = false
      }
    }

    if (!copied) {
      const pngUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `driver-${shipment}.png`
      link.href = pngUrl
      link.click()
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
    }

    window.open('https://wa.me/', '_blank', 'noopener,noreferrer')
    setShareNote(copied
      ? 'QR image copied! Press Ctrl+V in WhatsApp to send.'
      : 'QR image downloaded — attach it in WhatsApp to send.')
  }

  async function download() {
    const blob = await qrToPngBlob(qr.current, label)
    const pngUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `driver-${shipment}.png`
    link.href = pngUrl
    link.click()
    setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
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
    {shareNote && <p className="muted" role="status" style={{ marginTop: 8 }}>{shareNote}</p>}
    <div className="cw-actions"><span className="whatsapp-action"><ActionButton action={shareWhatsApp}>Share QR via WhatsApp</ActionButton></span><ActionButton action={download}>Download QR</ActionButton><ActionButton action={print}>Print QR</ActionButton></div>
  </div>
}

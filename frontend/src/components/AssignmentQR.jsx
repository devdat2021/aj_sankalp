import { useEffect, useRef, useState } from 'react'
import { ActionButton } from './Forms'
import { QRCodeCanvas } from 'qrcode.react'

function buildLabeledCanvas(sourceCanvas, labelText) {
  if (!sourceCanvas || !sourceCanvas.width) return null
  const scale = Math.max(1, sourceCanvas.width / 220)
  const pad = Math.round(20 * scale)
  const footer = labelText ? Math.round(30 * scale) : 0
  const out = document.createElement('canvas')
  out.width = sourceCanvas.width + pad * 2
  out.height = sourceCanvas.height + pad * 2 + footer
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(sourceCanvas, pad, pad)
  if (labelText) {
    ctx.fillStyle = '#142f42'
    ctx.font = `bold ${Math.round(13 * scale)}px Inter, Segoe UI, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(labelText, out.width / 2, sourceCanvas.height + pad + Math.round(20 * scale), out.width - pad * 2)
  }
  return out
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function workBaseOrigin() {
  const origin = window.location.origin
  if (import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) && import.meta.env.VITE_LAN_ORIGIN) {
    return import.meta.env.VITE_LAN_ORIGIN
  }
  return origin
}

export default function AssignmentQR({ token, shipment, details = {} }) {
  const qrCanvas = useRef(null)
  const imgRef = useRef(null)
  const blobRef = useRef(null)
  const [shareNote, setShareNote] = useState('')

  const url = new URL('/driver/work', workBaseOrigin())
  if (import.meta.env.PROD && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) url.protocol = 'https:'
  url.hash = token
  const urlHref = url.href
  const shortShipment = shipment && shipment.length > 16 ? `${shipment.slice(0, 8)}…` : shipment
  const label = [shortShipment, details.truck_id].filter(Boolean).join(' · ')

  useEffect(() => {
    let active = true
    blobRef.current = null
    const out = buildLabeledCanvas(qrCanvas.current, label)
    if (!out) return
    if (imgRef.current) imgRef.current.src = out.toDataURL('image/png')
    out.toBlob(blob => {
      if (active && blob) blobRef.current = blob
    }, 'image/png')
    return () => { active = false }
  }, [urlHref, label])

  async function ensureBlob() {
    if (blobRef.current) return blobRef.current
    const out = buildLabeledCanvas(qrCanvas.current, label)
    if (!out) throw new Error('QR code is still preparing, try again.')
    return await new Promise((resolve, reject) => {
      out.toBlob(b => (b ? resolve(b) : reject(new Error('Failed to generate QR image'))), 'image/png')
    })
  }

  function triggerDownload(blob) {
    const pngUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = `driver-${shipment}.png`
    link.href = pngUrl
    link.click()
    setTimeout(() => URL.revokeObjectURL(pngUrl), 1000)
  }

  async function copyQR() {
    setShareNote('')
    const blob = await ensureBlob()
    if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) {
      triggerDownload(blob)
      setShareNote(`Browser blocked clipboard on non-localhost HTTP — downloaded driver-${shipment}.png (or right-click QR → Copy image).`)
      return
    }
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    setShareNote('QR image copied! Press Ctrl+V in WhatsApp to send.')
  }

  async function shareWhatsApp() {
    setShareNote('')
    const blob = await ensureBlob()
    const file = new File([blob], `driver-${shipment}.png`, { type: 'image/png' })
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `CoastWatch QR · ${shipment}` })
        return
      } catch (error) {
        if (error.name === 'AbortError') return
      }
    }

    let copied = false
    if (window.isSecureContext && navigator.clipboard?.write && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        copied = true
      } catch {
        copied = false
      }
    }

    if (!copied) triggerDownload(blob)

    const target = isMobile ? 'whatsapp://send' : 'https://web.whatsapp.com/'
    const popup = window.open(target, '_blank', 'noopener,noreferrer')
    if (copied) {
      setShareNote(popup
        ? 'QR image copied! Select the driver chat in WhatsApp and press Ctrl+V to send.'
        : 'QR image copied! Open WhatsApp and press Ctrl+V in the driver chat to send.')
    } else {
      setShareNote(`QR saved as driver-${shipment}.png — drag the QR image above or attach it in WhatsApp (or open localhost for 1-click paste).`)
    }
  }

  async function download() {
    triggerDownload(await ensureBlob())
  }

  function print() {
    const page = window.open('', '_blank', 'width=480,height=520')
    if (!page) throw new Error('Allow the print window to open.')
    page.opener = null
    page.document.title = 'Driver assignment ' + shipment
    const title = page.document.createElement('h1')
    title.textContent = shipment
    const img = page.document.createElement('img')
    img.src = imgRef.current?.src || ''
    img.style.maxWidth = '280px'
    page.document.body.append(title, img)
    page.print()
  }

  return <div className="qr-share-card">
    <QRCodeCanvas ref={qrCanvas} value={urlHref} size={220} marginSize={2} style={{ display: 'none' }} />
    <img className="qr-share-image" ref={imgRef} width={200} alt={`Scan to open assigned work for ${shipment}`} />
    <div className="qr-share-body">
      <div className="qr-share-head">
        <span className="cw-eyebrow" style={{ margin: 0 }}>DRIVER ACCESS QR</span>
        <h3>{shortShipment}{details.truck_id ? ` · ${details.truck_id}` : ''}</h3>
        {(details.driver || details.destination) && (
          <p className="cw-muted">{[details.driver, details.destination].filter(Boolean).join(' → ')}</p>
        )}
      </div>
      {shareNote && <p className="qr-share-note" role="status">{shareNote}</p>}
      <div className="cw-actions">
        <span className="whatsapp-action"><ActionButton action={shareWhatsApp}><WhatsAppIcon /> Share QR</ActionButton></span>
        <ActionButton action={copyQR}>Copy QR</ActionButton>
        <ActionButton action={download}>Download PNG</ActionButton>
        <ActionButton action={print}>Print</ActionButton>
      </div>
    </div>
  </div>
}

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
    ctx.fillText(labelText, out.width / 2, sourceCanvas.height + pad + Math.round(20 * scale))
  }
  return out
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
  const label = [shipment, details.truck_id].filter(Boolean).join(' · ')

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

  return <div>
    <h3>Driver access · {shipment}</h3>
    <QRCodeCanvas ref={qrCanvas} value={urlHref} size={220} marginSize={2} style={{ display: 'none' }} />
    <img ref={imgRef} width={220} alt={`Scan to open assigned work for ${shipment}`} style={{ display: 'block', background: '#fff', borderRadius: 8, border: '1px solid #dbe4e9' }} />
    {shareNote && <p className="muted" role="status" style={{ marginTop: 8 }}>{shareNote}</p>}
    <div className="cw-actions">
      <span className="whatsapp-action"><ActionButton action={shareWhatsApp}>Share QR via WhatsApp</ActionButton></span>
      <ActionButton action={copyQR}>Copy QR</ActionButton>
      <ActionButton action={download}>Download QR</ActionButton>
      <ActionButton action={print}>Print QR</ActionButton>
    </div>
  </div>
}

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import DriverPortal from './DriverPortal'

const storageKey = 'coastwatch.driver.work'

function OpenWork({ code }) {
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    async function open() {
      try {
        let next
        if (code) {
          sessionStorage.removeItem(storageKey)
          next = await api('/driver/work/exchange', null, 'POST', { token: code })
          if (!active) return
          sessionStorage.setItem(storageKey, JSON.stringify(next))
          window.history.replaceState(window.history.state, '', window.location.pathname)
        } else {
          next = JSON.parse(sessionStorage.getItem(storageKey))
          if (!next?.token || !next.user) throw new Error('Scan your assignment QR code to open your work.')
        }
        if (active) setSession(next)
      } catch (err) {
        if (active) setError(err.message)
      }
    }
    open()
    return () => { active = false }
  }, [code])
  if (session) return <DriverPortal workSession={session} />
  return <main className="cw-loading" role="status">{error || 'Opening your assignment…'}</main>
}

export default function DriverWork() {
  const { hash } = useLocation()
  return <OpenWork key={hash} code={hash.slice(1)} />
}

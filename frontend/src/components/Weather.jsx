import { stamp } from '../services/format'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'


export default function Weather({ port, token }) {
  const [mode, setMode] = useState('land')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [asOf, setAsOf] = useState(() => Date.now())
  const load = useCallback(async signal => {
    setBusy(true); setError('')
    try {
      const next = await api(`/ports/${port.id}/weather?mode=${mode}`, token, 'GET', undefined, signal)
      if (!signal?.aborted) { setResult(next); setAsOf(Date.now()) }
    }
    catch (err) { if (!signal?.aborted) { setResult(null); setError(err.message) } }
    finally { if (!signal?.aborted) setBusy(false) }
  }, [port.id, mode, token])
  useEffect(() => {
    const controller = new AbortController()
    const initial = setTimeout(() => load(controller.signal), 0)
    const interval = setInterval(() => load(controller.signal), 600000)
    return () => { controller.abort(); clearTimeout(initial); clearInterval(interval) }
  }, [load])
  const hourly = result?.forecast?.hourly
  const units = result?.forecast?.hourly_units || {}
  const keys = mode === 'land' ? ['temperature_2m', 'precipitation', 'wind_speed_10m'] : ['wave_height', 'wave_period']
  const labels = { temperature_2m: 'Temperature', precipitation: 'Rain', wind_speed_10m: 'Wind', wave_height: 'Wave height', wave_period: 'Wave period' }
  const future = hourly?.time?.map((t, i) => ({ time: t, i })).filter(({ time }) => new Date(`${time}Z`).getTime() >= asOf - 3600000).slice(0, 8) || []
  return <section className="cw-card"><div className="cw-row"><div><h2>Port weather</h2><p>{port.name} · {port.lat}, {port.lng}</p></div><label className="cw-field"><span>Forecast</span><select value={mode} onChange={e => { setResult(null); setMode(e.target.value) }}><option value="land">Land</option><option value="marine">Marine</option></select></label></div>
    {busy && <p role="status">Loading forecast…</p>}{error && <div role="alert" className="cw-error">{error}<p>Reports and approvals remain available.</p></div>}
    {result && <><p className={result.stale ? 'cw-error' : 'cw-muted'}>{result.stale ? 'Provider unavailable — showing cached forecast. ' : ''}{result.source} · Fetched {stamp(result.fetched_at)} · times shown locally</p><div className="cw-table"><table><thead><tr><th>Time</th>{keys.map(k => <th key={k}>{labels[k]} ({units[k] || '—'})</th>)}</tr></thead><tbody>{future.map(({ time, i }) => <tr key={time}><td>{stamp(`${time}Z`)}</td>{keys.map(k => <td key={k}>{hourly[k]?.[i] ?? 'Unavailable'}</td>)}</tr>)}</tbody></table></div>{!future.length && <p>No upcoming forecast hours available.</p>}</>}
    <button disabled={busy} onClick={() => load()}>Refresh forecast</button>
  </section>
}

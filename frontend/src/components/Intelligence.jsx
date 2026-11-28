import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { stamp } from '../services/format'
import { intelligenceErrorMessage } from '../services/intelligenceErrors'
import IntelligenceInputs, { FleetInputs } from './IntelligenceInputs'
import { selectedIntelligence, analysisLabels } from '../services/intelligenceView'
import './Intelligence.css'

const operators = ['port', 'logistics']

function integrationMessage(name, result) {
  if (result.status === 'verified') return 'Verified for this analysis.'
  if (result.status === 'not_called') return 'Not called because required inputs are missing or infeasible.'
  if (name === 'gemini') {
    if (/HTTP 503|UNAVAILABLE/.test(result.error || '')) return 'AI review is temporarily unavailable. No AI-generated analysis was used.'
    return 'AI review is unavailable. No AI-generated analysis was used.'
  }
  if (/HTTP 503|UNAVAILABLE/.test(result.error || '')) return 'Schedule optimization is temporarily unavailable; no schedule was generated.'
  return 'Schedule optimization is unavailable; no schedule was generated.'
}

function shipmentName(id, shipments) {
  const row = shipments.find(shipment => shipment.id === id)
  return row ? `${id} · ${row.cargo}` : id
}

function scheduleTime(value) {
  return value ? stamp(value) : 'Not recorded'
}

function IntegrationStatus({ name, result }) {
  const label = name === 'gemini' ? 'Gemini AI review' : 'Google schedule optimization'
  return <li>
    <strong>{label}:</strong> {integrationMessage(name, result)}
    {(result.effective_model || result.configured_model) && <span> Model: {result.effective_model || result.configured_model}.</span>}
    {(result.error || result.reason) && <details><summary>Technical details</summary><p>{result.error || result.reason}</p></details>}
  </li>
}

function ComparisonTable({ rows, shipments }) {
  if (!rows?.length) return <p className="cw-muted">No comparable baseline and proposed schedule were available.</p>
  return <div className="cw-table">
    <table>
      <thead><tr><th>Consignment</th><th>Baseline delivery</th><th>Proposed delivery</th><th>Difference</th><th>Deadline result</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.shipment_id}>
        <th scope="row">{shipmentName(row.shipment_id, shipments)}</th>
        <td>{scheduleTime(row.baseline_delivery_at)}</td>
        <td>{scheduleTime(row.optimized_delivery_at)}</td>
        <td>{row.delivery_change_seconds == null ? 'No baseline recorded' : `${Math.round(Math.abs(row.delivery_change_seconds) / 60)} min ${row.delivery_change_seconds < 0 ? 'earlier' : row.delivery_change_seconds > 0 ? 'later' : 'unchanged'}`}</td>
        <td>{row.optimized_lateness_seconds == null ? 'No deadline comparison' : row.optimized_lateness_seconds > 0 ? `${Math.round(row.optimized_lateness_seconds / 60)} min late` : 'Within recorded deadline'}</td>
      </tr>)}</tbody>
    </table>
  </div>
}

export default function Intelligence({ token, user, shipments = [], vehicles = [], onSaved }) {
  const [editing, setEditing] = useState(false)
  const [reviewing, setReviewing] = useState('')
  const [jobs, setJobs] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [health, setHealth] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [refreshing, setRefreshing] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [selected, setSelected] = useState('')
  const [reasons, setReasons] = useState({})
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState(null)
  const requestSequence = useRef(0)
  const refreshController = useRef(null)
  const invalidateRequests = useCallback(() => {
    requestSequence.current++
    refreshController.current?.abort()
  }, [])
  const pollActive = useRef(false)
  const jobsRef = useRef([])
  const recommendationsRef = useRef([])
  const operator = operators.includes(user.role)

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current
    setRefreshing(true)
    refreshController.current?.abort()
    const controller = new AbortController()
    refreshController.current = controller
    try {
      const result = await api('/intelligence/overview', token, 'GET', undefined, controller.signal, 45000)
      if (request !== requestSequence.current) return false
      setHealth(result.health)
      recommendationsRef.current = result.recommendations
      jobsRef.current = result.analyses
      setRecommendations(result.recommendations)
      setJobs(result.analyses)
      pollActive.current = result.analyses.some(job => ['queued', 'running'].includes(job.status)) ||
        result.recommendations.some(rec => rec.status === 'pending')
      setLoadError(null)
      return true
    } catch (error) {
      if (request !== requestSequence.current || controller.signal.aborted) return false
      setLoadError([['Operational intelligence', error]])
      return false
    } finally {
      if (request === requestSequence.current) setRefreshing(false)
    }
  }, [token])

  useEffect(() => {
    let active = true
    let timer
    let inFlight = false
    const load = async () => {
      if (!active || inFlight) return
      if (document.hidden) {
        timer = setTimeout(load, 15000)
        return
      }
      inFlight = true
      try { await refresh() } finally {
        inFlight = false
        if (active) timer = setTimeout(load, pollActive.current ? 7000 : 30000)
      }
    }
    const refreshVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        load()
      }
    }
    load()
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      active = false
      invalidateRequests()
      clearTimeout(timer)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [invalidateRequests, refresh])

  async function act(path, body, success) {
    setBusyAction(path); setActionMessage(''); setActionError(null)
    try {
      const result = await api(path, token, 'POST', body)
      await refresh()
      await onSaved?.()
      setReviewing('')
      setActionMessage(path === '/intelligence/analyses' && !['queued', 'running'].includes(result.status) ? 'Showing the latest analysis for these inputs.' : success)
    } catch (error) {
      setActionError(error)
    } finally { setBusyAction('') }
  }

  const activeShipments = shipments.filter(shipment => shipment.status !== 'delivered')
  const selectedId = activeShipments.some(shipment => shipment.id === selected) ? selected : activeShipments[0]?.id || ''
  const selectedShipment = shipments.find(shipment => shipment.id === selectedId)
  const { latest, current, history } = selectedIntelligence(jobs, recommendations, selectedId, operator)
  const analyzing = ['queued', 'running'].includes(latest?.status)
  const canRetry = operator && ['failed', 'degraded', 'stale'].includes(latest?.status)
  const summary = latest?.analyst?.operational_summary || (
    analyzing ? 'Checking shipment impact and recovery options. Results will appear here.' :
    latest?.missing_inputs?.length ? 'A few planning details need attention before a complete schedule can be prepared.' :
    latest ? 'Review the available recovery actions below.' :
    'Select a shipment and analyze its latest risks and recovery options.')
  const actionable = current.filter(rec => rec.status === 'pending' && rec.responsible_role === user.role && !rec.advisory)

  function renderRecommendation(rec, historical = false) {
    const path = `/intelligence/recommendations/${rec.id}/decision`
    const canDecide = !historical && actionable.includes(rec)
    const assignments = rec.proposed_state?.assignments || []
    const title = rec.action === 'hold_dispatch' ? 'Hold dispatch until cargo is ready' : rec.action === 'schedule_transport' ? 'Revise transport schedule' : 'Review operational constraint'
    return <article key={rec.id} className="intel-action">
      <div className="intel-action-heading"><h4>{title}</h4><span className={`intel-tag ${rec.status}`}>{rec.status === 'executed' ? 'Approved' : rec.status.replaceAll('_', ' ')}</span></div>
      <p>{rec.reason}</p>
      <div className="intel-action-meta"><span>{rec.shipment_ids.join(', ')}</span><span>Owner: {rec.responsible_role}</span>
        {canDecide && <button type="button" className="intel-link" onClick={() => setReviewing(reviewing === rec.id ? '' : rec.id)} aria-expanded={reviewing === rec.id}>Review decision</button>}
      </div>
      {rec.unavailable_reason && <p className="cw-muted">{rec.unavailable_reason}</p>}
      <details open={reviewing === rec.id || undefined} className="intel-disclosure"><summary>Schedule and supporting details</summary>
        {assignments.map(a => <p key={a.shipment_id}><strong>{a.shipment_id} · {a.truck_id}</strong><br/>{a.dispatch_not_before
          ? `Do not dispatch before ${stamp(a.dispatch_not_before)}. Operational clearance is still required.`
          : `Dispatch ${scheduleTime(a.planned_dispatch_at)} · Pickup ${scheduleTime(a.planned_pickup_at)} · Delivery ${scheduleTime(a.planned_delivery_at)}`}</p>)}
        {!!rec.impact?.length && <ComparisonTable rows={rec.impact} shipments={shipments}/>}
        <small>{rec.source} · {stamp(rec.created_at)}</small>
        {rec.advisory && <p className="cw-muted">Use the existing incident, capacity or reroute workflow for this advisory.</p>}
      </details>
      {canDecide && reviewing === rec.id && <div className="intel-decision">
        <label className="cw-field">Decision reason<textarea value={reasons[rec.id] || ''} maxLength={500} onChange={event => setReasons(previous => ({ ...previous, [rec.id]: event.target.value }))} placeholder="Why is this the right operational decision?"/></label>
        <div className="cw-actions">
          <button type="button" className="cw-primary" disabled={!!busyAction || (reasons[rec.id] || '').trim().length < 3} onClick={() => act(path, { status: 'approved', reason: reasons[rec.id].trim() }, 'Approved. Stakeholder instructions have been updated.')}>Approve {rec.action === 'hold_dispatch' ? 'hold' : 'schedule'}</button>
          <button type="button" disabled={!!busyAction || (reasons[rec.id] || '').trim().length < 3} onClick={() => act(path, { status: 'rejected', reason: reasons[rec.id].trim() }, 'Recommendation rejected.')}>Reject</button>
        </div>
      </div>}
    </article>
  }

  return <section className="cw-card workflow-content intelligence-panel" aria-label="Operational intelligence">
    <header className="intel-header"><div><span className="intel-eyebrow">OPERATIONS ASSISTANT</span>
      <h2>{user.role === 'driver' ? 'Your updated instructions' : user.role === 'captain' ? 'Vessel impact' : 'Operational intelligence'}</h2>
      <p>Understand the impact. Review the next step.</p></div>
      <span className={`intel-tag ${latest?.status || ''}`} role="status">{health?.enabled === false ? 'Analysis disabled' : latest ? analysisLabels[latest.status] || latest.status : refreshing ? 'Loading…' : 'Ready to analyze'}</span>
    </header>
    {loadError && <div className="cw-error" role="alert">Some results could not be refreshed. <button type="button" onClick={refresh} disabled={refreshing}>Try again</button></div>}
    {actionError && <p className="cw-error" role="alert">{intelligenceErrorMessage(actionError)}</p>}
    {actionMessage && <p className="intel-feedback" role="status">{actionMessage}</p>}
    {operator && <div className="intel-toolbar">
      <label className="cw-field">Consignment<select aria-label="Consignment to analyze" value={selectedId} onChange={event => { setSelected(event.target.value); setActionMessage(''); setActionError(null); setEditing(false); setReviewing('') }}>
        {!activeShipments.length && <option value="">No active consignments</option>}
        {activeShipments.map(s => <option key={s.id} value={s.id}>{s.id} · {s.cargo}</option>)}
      </select></label>
      <button className="cw-primary" type="button" disabled={!!busyAction || analyzing || !selectedId || health?.enabled === false || (refreshing && !health)} onClick={() => act('/intelligence/analyses', { shipment_id: selectedId, ...(canRetry ? { retry: true } : {}) }, 'Analysis started. We’ll update the results here.')}>
        {analyzing || busyAction === '/intelligence/analyses' ? 'Analyzing…' : canRetry ? 'Analyze again' : 'Analyze disruption'}
      </button>
    </div>}
    {operator && <div className="intel-summary">
      <p>{summary}</p>
      <div className="intel-summary-meta">{latest && <span>Updated {stamp(latest.completed_at || latest.created_at)}</span>}{actionable.length > 0 && <span>{actionable.length} decision{actionable.length > 1 ? 's' : ''} to review</span>}</div>
      {!!latest?.missing_inputs?.length && <details className="intel-disclosure"><summary>{latest.missing_inputs.length} planning detail{latest.missing_inputs.length > 1 ? 's' : ''} to check</summary><ul>{latest.missing_inputs.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
    </div>}
    <section className="intel-action-list" aria-label="Operational recommendations">
      {current.length > 0 ? current.slice(0, 3).map(rec => renderRecommendation(rec)) : <p className="intel-empty">{analyzing ? 'Recovery options are being evaluated.' : operator ? 'No current decisions to review for this shipment.' : 'No updated instructions for your assignments.'}</p>}
      {current.length > 3 && <details className="intel-disclosure"><summary>Show {current.length - 3} more recommendations</summary>{current.slice(3).map(rec => renderRecommendation(rec))}</details>}
    </section>
    {operator && selectedShipment && <details className="intel-disclosure intel-input-drawer" open={editing} onToggle={event => setEditing(event.currentTarget.open)}>
      <summary>Manage planning inputs <span>Shipment{user.role === 'logistics' ? ' & fleet' : ' readiness'}</span></summary>
      {editing && <div className="intel-input-content"><IntelligenceInputs key={selectedId} shipment={selectedShipment} token={token} role={user.role} onSaved={onSaved}/>{user.role === 'logistics' && <FleetInputs vehicles={vehicles} token={token} onSaved={onSaved}/>}</div>}
    </details>}
    <footer className="intel-footer">
      <details className="intel-disclosure"><summary>Analysis details & history</summary>
        {latest?.analyst && <><h3>Why this matters</h3><p>{latest.analyst.root_cause_analysis}</p><ul>{latest.analyst.cascading_consequences?.map((item, i) => <li key={i}>{item}</li>)}</ul><h3>Assumptions</h3><ul>{latest.analyst.assumptions_and_uncertainties?.map((item, i) => <li key={i}>{item}</li>)}</ul></>}
        {!!latest?.comparison?.length && <ComparisonTable rows={latest.comparison} shipments={shipments}/>}
        {latest?.integrations && <ul>{Object.entries(latest.integrations).map(([name, result]) => <IntegrationStatus key={name} name={name} result={result}/>)}</ul>}
        {health && <p className="cw-muted">AI model: {health.gemini_effective_model || health.gemini_model}. {health.enabled ? 'Analysis enabled.' : 'Analysis disabled.'}</p>}
        {operator && <small>Analysis may call paid services. Recent unchanged inputs reuse results.</small>}
        {latest?.error && <p>{latest.error}</p>}
        {actionError && <p>{actionError.message}</p>}
        {!!latest?.evidence?.length && <details className="intel-disclosure"><summary>Supporting evidence ({latest.evidence.length})</summary>{latest.evidence.map(item => <div key={item.id}><strong>{item.kind.replaceAll('_', ' ')}</strong><pre>{JSON.stringify(item.details, null, 2)}</pre></div>)}</details>}
        {!!history.length && <details className="intel-disclosure"><summary>Previous decisions ({history.length})</summary>{history.map(rec => renderRecommendation(rec, true))}</details>}
      </details>
      <small>Changes require approval from the responsible operator.</small>
    </footer>
  </section>
}

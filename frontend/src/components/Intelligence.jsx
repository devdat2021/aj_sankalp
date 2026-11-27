import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import { stamp } from '../services/format'
import { intelligenceErrorMessage } from '../services/intelligenceErrors'
import IntelligenceInputs, { FleetInputs } from './IntelligenceInputs'

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
  const invalidateRequests = useCallback(() => { requestSequence.current++ }, [])
  const pollActive = useRef(false)
  const jobsRef = useRef([])
  const recommendationsRef = useRef([])
  const operator = operators.includes(user.role)

  const refresh = useCallback(async () => {
    const request = ++requestSequence.current
    setRefreshing(true)
    const results = await Promise.allSettled([
      api('/intelligence/health', token),
      api('/intelligence/recommendations', token),
      operator ? api('/intelligence/analyses', token) : Promise.resolve([])
    ])
    if (request !== requestSequence.current) return false

    const failures = []
    if (results[0].status === 'fulfilled') setHealth(results[0].value)
    else failures.push(['Service status', results[0].reason])
    if (results[1].status === 'fulfilled') {
      recommendationsRef.current = results[1].value
      setRecommendations(results[1].value)
    }
    else failures.push(['Recommendations', results[1].reason])
    if (results[2].status === 'fulfilled') {
      jobsRef.current = results[2].value
      setJobs(results[2].value)
    }
    else failures.push(['Analyses', results[2].reason])

    const nextJobs = results[2].status === 'fulfilled' ? results[2].value : jobsRef.current
    const nextRecs = results[1].status === 'fulfilled' ? results[1].value : recommendationsRef.current
    pollActive.current = nextJobs.some(job => ['queued', 'running'].includes(job.status)) ||
      nextRecs.some(rec => rec.status === 'pending')
    setLoadError(failures.length ? failures : null)
    setRefreshing(false)
    return failures.length === 0
  }, [operator, requestSequence, token])

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
      await api(path, token, 'POST', body)
      await refresh()
      await onSaved?.()
      setActionMessage(success)
    } catch (error) {
      setActionError(error)
    } finally { setBusyAction('') }
  }

  const activeShipments = shipments.filter(shipment => shipment.status !== 'delivered')
  const selectedId = activeShipments.some(shipment => shipment.id === selected) ? selected : activeShipments[0]?.id || ''
  const selectedShipment = shipments.find(shipment => shipment.id === selectedId)
  const latest = jobs[0]
  const latestForSelection = latest && latest.shipment_ids?.includes(selectedId)
  const canRetry = operator && latestForSelection && ['failed', 'degraded', 'stale'].includes(latest.status)
  const modelStatus = health?.gemini_configured
    ? `Gemini configured · ${health.gemini_effective_model || health.gemini_model}. Provider generation is verified only by an analysis.`
    : 'Gemini is not configured. No AI-generated analysis will be shown.'

  return <section className="cw-card workflow-content intelligence-panel" aria-label="Operational intelligence">
    <div className="cw-row">
      <div>
        <h2>{user.role === 'driver' ? 'Approved recovery instructions' : user.role === 'captain' ? 'Vessel operational impact' : 'Operational intelligence'}</h2>
        <p className="cw-muted">Evidence-based disruption impact and validated schedules. Analysis never authorizes dispatch, port access or physical pickup.</p>
      </div>
      {refreshing && <span role="status" aria-live="polite">Refreshing intelligence…</span>}
    </div>

    {loadError && <div className="cw-error" role="alert">
      <p>Some intelligence data could not be refreshed. Previously loaded results are retained.</p>
      <button type="button" onClick={refresh} disabled={refreshing}>Retry refresh</button>
      <details><summary>Technical details</summary><ul>{loadError.map(([label, error]) => <li key={label}>{label}: {error.status ? `HTTP ${error.status}` : error.message || 'Request failed'}</li>)}</ul></details>
    </div>}
    {actionError && <div className="cw-error" role="alert">
      <p>{intelligenceErrorMessage(actionError)}</p>
      <details><summary>Technical details</summary><p>{actionError.status ? `HTTP ${actionError.status}. ` : ''}{actionError.message}</p></details>
    </div>}
    {actionMessage && <p className="cw-success" role="status">{actionMessage}</p>}

    {health && <details className="intelligence-service-status">
      <summary>Service readiness · {health.enabled ? 'analysis enabled' : 'analysis disabled'}</summary>
      <p>{health.enabled ? 'Analysis jobs can be queued.' : 'Analysis is disabled by workspace configuration. Confirmed inputs can still be saved.'}</p>
      <ul>
        <li>Google optimization: {health.google_configured ? 'configured; last-analysis status shows whether the provider call succeeded.' : 'not configured or disabled.'}</li>
        <li>{modelStatus}</li>
        <li>Storage: {health.storage}. Health checks do not make paid provider calls.</li>
      </ul>
    </details>}

    {operator && <div className="cw-actions intelligence-controls">
      <label className="cw-field">Consignment to analyze
        <select aria-label="Consignment to analyze" value={selectedId} onChange={event => setSelected(event.target.value)}>
          <option value="">Select consignment</option>
          {activeShipments.map(shipment => <option key={shipment.id} value={shipment.id}>{shipment.id} · {shipment.cargo}</option>)}
        </select>
      </label>
      <button className="cw-primary" type="button" disabled={busyAction !== '' || !selectedId || health?.enabled === false || (refreshing && !health)}
        onClick={() => act('/intelligence/analyses', { shipment_id: selectedId }, 'Analysis queued. Results will appear when processing completes.')}>
        {busyAction === '/intelligence/analyses' ? 'Queueing analysis…' : 'Analyze disruption'}
      </button>
      {canRetry && <button type="button" disabled={busyAction !== '' || health?.enabled === false}
        onClick={() => act('/intelligence/analyses', { shipment_id: selectedId, retry: true }, 'A new paid analysis was queued.')}>
        {busyAction === '/intelligence/analyses' ? 'Queueing retry…' : 'Retry paid analysis'}
      </button>}
      <small>Analysis may call paid services. Unchanged recent inputs reuse the existing result; retries are rate-limited.</small>
    </div>}

    {operator && selectedShipment && <div className="intelligence-inputs">
      <h3>Operational inputs · {selectedShipment.id}</h3>
      <IntelligenceInputs key={selectedShipment.id} shipment={selectedShipment} token={token} role={user.role} onSaved={onSaved}/>
      {user.role === 'logistics' && <FleetInputs vehicles={vehicles} token={token} onSaved={onSaved}/>}
    </div>}

    {latest && <details open className="intelligence-analysis">
      <summary>Latest analysis · {latest.status} · {stamp(latest.created_at)}{latest.trigger ? ` · ${latest.trigger.replaceAll('_', ' ')}` : ''}</summary>
      <h3>Affected consignments</h3>
      {latest.shipment_ids?.length
        ? <ul>{latest.shipment_ids.map(id => <li key={id}>{shipmentName(id, shipments)}</li>)}</ul>
        : <p className="cw-muted">No affected consignments were recorded.</p>}

      {latest.status === 'queued' && <p role="status">Analysis is waiting for the background worker.</p>}
      {latest.status === 'running' && <p role="status">Providers are evaluating the current evidence. No operational changes are applied during analysis.</p>}
      {latest.status === 'failed' && <p className="cw-error">Analysis could not be completed. No operational changes were applied.</p>}

      {!!latest.integrations && <div>
        <h3>Provider status</h3>
        <ul>{Object.entries(latest.integrations).map(([name, result]) => <IntegrationStatus key={name} name={name} result={result}/>)}</ul>
      </div>}
      {latest.error && <details><summary>Analysis diagnostics</summary><p>{latest.error}</p></details>}

      {latest.analyst
        ? <section aria-label="AI operational review">
          <h3>AI analysis · {latest.analyst.severity} severity</h3>
          <p><strong>Operational summary:</strong> {latest.analyst.operational_summary}</p>
          <p><strong>Root-cause assessment:</strong> {latest.analyst.root_cause_analysis}</p>
          {!!latest.analyst.cascading_consequences?.length && <><strong>Potential cascading consequences</strong><ul>{latest.analyst.cascading_consequences.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          {!!latest.analyst.recommendations?.length && <><strong>Evidence-linked review of candidate actions</strong><ul>{latest.analyst.recommendations.map(item => {
            const rec = recommendations.find(recommendation => recommendation.id === item.candidate_id)
            return <li key={item.candidate_id}>{rec?.action?.replaceAll('_', ' ') || 'Candidate action'}: {item.reasoning} <small>Evidence: {item.evidence_ids.join(', ')}</small></li>
          })}</ul></>}
          {!!latest.analyst.assumptions_and_uncertainties?.length && <><strong>Assumptions and uncertainty</strong><ul>{latest.analyst.assumptions_and_uncertainties.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        </section>
        : latest.integrations?.gemini?.status === 'unavailable' && <p className="cw-muted" role="status">Gemini did not return a validated review. No AI narrative has been fabricated; any listed actions come from separately validated operational calculations.</p>}

      {!!latest.missing_inputs?.length && <details><summary>Missing inputs and constraints ({latest.missing_inputs.length})</summary><ul>{latest.missing_inputs.map((item, index) => <li key={index}>{item}</li>)}</ul><p className="cw-muted">Port confirms cargo readiness and pickup windows. Logistics confirms shipment requirements and fleet availability.</p></details>}
      {!!latest.comparison?.length && <section><h3>Baseline versus proposed schedule</h3><ComparisonTable rows={latest.comparison} shipments={shipments}/><p className="cw-muted">Comparisons use recorded baselines and validated provider schedules; no realized savings are inferred.</p></section>}
      {!!latest.evidence?.length && <details><summary>Disruption evidence and affected entities ({latest.evidence.length})</summary>
        <ul>{latest.evidence.map(item => <li key={item.id}>
          <strong>{item.kind.replaceAll('_', ' ')}</strong> · {item.entity_ids.map(id => shipmentName(id, shipments)).join(', ')}
          <details><summary>Evidence details</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(item.details, null, 2)}</pre></details>
        </li>)}</ul>
      </details>}
    </details>}

    <section className="intelligence-recommendations" aria-label="Operational recommendations">
      <h3>Recommendations and decisions</h3>
      {!recommendations.length && <p className="cw-muted">{refreshing ? 'Loading recommendations…' : 'No recommendations are available for this role and scope yet.'}</p>}
      {recommendations.slice(0, 20).map(recommendation => {
        const path = `/intelligence/recommendations/${recommendation.id}/decision`
        const canDecide = recommendation.status === 'pending' && recommendation.responsible_role === user.role && operator && !recommendation.advisory
        const assignments = recommendation.proposed_state?.assignments || []
        return <article key={recommendation.id} className="cw-card intelligence-recommendation">
          <div className="cw-row"><h4>{recommendation.action === 'hold_dispatch' ? 'Dispatch hold' : recommendation.action === 'schedule_transport' ? 'Transport schedule' : 'Operational constraint review'}</h4><span className="cw-badge">{recommendation.status}</span></div>
          <p><strong>Affected consignments:</strong> {recommendation.shipment_ids.map(id => shipmentName(id, shipments)).join(', ')}</p>
          <p><strong>Decision owner:</strong> {recommendation.responsible_role}{recommendation.advisory ? ' · Advisory only' : ''}</p>
          <p>{recommendation.reason}</p>
          <small>{recommendation.source || 'Operational calculation'} · Created {stamp(recommendation.created_at)} · Valid until {stamp(recommendation.expires_at)}</small>
          {!!assignments.length && <div>
            <h5>Proposed assignments</h5>
            {assignments.map(assignment => <p key={assignment.shipment_id}>
              {shipmentName(assignment.shipment_id, shipments)} · Vehicle {assignment.truck_id}.
              {assignment.dispatch_not_before
                ? ` Do not dispatch before ${stamp(assignment.dispatch_not_before)}. Obtain operational clearance before departure.`
                : ` Proposed dispatch ${scheduleTime(assignment.planned_dispatch_at)}, pickup ${scheduleTime(assignment.planned_pickup_at)}, delivery ${scheduleTime(assignment.planned_delivery_at)}.`}
            </p>)}
          </div>}
          {!!recommendation.impact?.length && <section><h5>Schedule impact</h5><ComparisonTable rows={recommendation.impact} shipments={shipments}/></section>}
          {recommendation.status === 'executed' && <p role="status">Approved operational update. Relevant portal notifications and shipment instructions are available.</p>}
          {recommendation.status === 'advisory' && <p className="cw-muted">This item cannot be approved here. Use the existing authorized incident, capacity or reroute workflow.</p>}
          {canDecide && <div className="cw-stack">
            <label className="cw-field">Decision reason
              <textarea value={reasons[recommendation.id] || ''} maxLength={500} minLength={3}
                onChange={event => setReasons(previous => ({ ...previous, [recommendation.id]: event.target.value }))}
                placeholder="Explain the operational basis for this decision"/>
            </label>
            <div className="cw-actions">
              <button type="button" className="cw-primary" disabled={busyAction !== '' || (reasons[recommendation.id] || '').trim().length < 3}
                onClick={() => act(path, { status: 'approved', reason: reasons[recommendation.id].trim() }, 'Decision recorded. Shipment updates and role-scoped notifications are refreshed.')}>
                {busyAction === path ? 'Saving decision…' : recommendation.action === 'hold_dispatch' ? 'Approve dispatch hold' : 'Approve schedule'}
              </button>
              <button type="button" disabled={busyAction !== '' || (reasons[recommendation.id] || '').trim().length < 3}
                onClick={() => act(path, { status: 'rejected', reason: reasons[recommendation.id].trim() }, 'Recommendation rejected. No operational schedule changes were applied.')}>
                Reject
              </button>
            </div>
          </div>}
        </article>
      })}
    </section>
  </section>
}

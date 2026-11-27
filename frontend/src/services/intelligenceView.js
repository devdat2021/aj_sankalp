export function selectedIntelligence(jobs, recommendations, shipmentId, operator) {
  const latest = jobs.find(job => job.shipment_ids?.includes(shipmentId))
  const scoped = recommendations.filter(rec => !operator || rec.shipment_ids?.includes(shipmentId))
  const current = scoped.filter(rec => operator
    ? rec.analysis_id === latest?.id && ['pending', 'advisory', 'executed'].includes(rec.status)
    : rec.status === 'executed' || rec.status === 'advisory')
  return { latest, current, history: scoped.filter(rec => !current.includes(rec)) }
}

export const analysisLabels = {
  queued: 'Queued', running: 'Analyzing', completed: 'Analysis ready', needs_input: 'Inputs needed',
  degraded: 'Partial analysis', stale: 'Update needed', superseded: 'Replaced', failed: 'Analysis unavailable',
}

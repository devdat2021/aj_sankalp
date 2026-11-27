import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectedIntelligence } from '../src/services/intelligenceView.js'

test('selected consignment gets its own latest analysis and decisions', () => {
  const jobs = [{ id: 'B', shipment_ids: ['S2'] }, { id: 'A', shipment_ids: ['S1'] }]
  const recs = [
    { id: 'old', analysis_id: 'OLD', shipment_ids: ['S1'], status: 'pending' },
    { id: 'current', analysis_id: 'A', shipment_ids: ['S1'], status: 'pending' },
    { id: 'other', analysis_id: 'B', shipment_ids: ['S2'], status: 'pending' },
  ]
  const view = selectedIntelligence(jobs, recs, 'S1', true)
  assert.equal(view.latest.id, 'A')
  assert.deepEqual(view.current.map(r => r.id), ['current'])
  assert.deepEqual(view.history.map(r => r.id), ['old'])
})

test('expired proposals remain in history rather than actionable overview', () => {
  const rec = { analysis_id: 'A', shipment_ids: ['S1'], status: 'expired' }
  const view = selectedIntelligence([{ id: 'A', shipment_ids: ['S1'] }], [rec], 'S1', true)
  assert.equal(view.current.length, 0)
  assert.equal(view.history.length, 1)
})

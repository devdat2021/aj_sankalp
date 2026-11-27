import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let vite, Requests, Cargo, Intelligence, IntelligenceInputs, FleetInputs
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  Requests = (await vite.ssrLoadModule('/src/components/Requests.jsx')).default
  Cargo = (await vite.ssrLoadModule('/src/components/Cargo.jsx')).default
  Intelligence = (await vite.ssrLoadModule('/src/components/Intelligence.jsx')).default
  IntelligenceInputs = (await vite.ssrLoadModule('/src/components/IntelligenceInputs.jsx')).default
  FleetInputs = (await vite.ssrLoadModule('/src/components/IntelligenceInputs.jsx')).FleetInputs
})
after(async () => { await vite?.close() })

const user = { id: 'L', role: 'logistics', company_id: 'C' }
const shipment = { id: 'S', cargo: 'Cargo', company_id: 'C', status: 'ready_for_pickup', truck_id: 'T', quantity: 2, eta_hours: 3,
  route: { id: 'OLD', name: 'Coastal road' }, eligibility: { unloaded: true, ready_for_pickup: true, truck_access_approved: true, pickup_allowed: true } }
const proposal = { id: 'R', shipment_id: 'S', status: 'pending', reason: 'Flood report', options: [{ id: 'ALT', name: 'Inland road', delay_hours: 2, cost: 100, risk: 10 }] }
function props(row = proposal) {
  return { user, mutate: async () => {}, data: { shipments: [shipment], requests: [row], port_requests: [], docking_requests: [],
    vehicles: [{ id: 'T', company_id: 'C', name: 'Truck', driver_id: 'D' }], port: { id: 'NMP', berths: 8 } } }
}

test('logistics compares proposals with the active route and must choose an approval option', () => {
  const html = renderToStaticMarkup(createElement(Requests, props()))
  assert.match(html, /Coastal road/)
  assert.match(html, /Inland road/)
  assert.match(html, /5 h/)
  assert.match(html, /Choose a proposed route/)
  assert.match(html, /Record decision/)
})

test('superseded and decided requests cannot render decision controls', () => {
  for (const status of ['superseded', 'approved', 'rejected']) {
    const html = renderToStaticMarkup(createElement(Requests, props({ ...proposal, status, decision_reason: 'Reviewed safely', superseded_reason: status === 'superseded' ? 'Submit a fresh proposal.' : undefined })))
    assert.doesNotMatch(html, /Record decision/)
    assert.match(html, /Reviewed safely/)
    if (status === 'superseded') assert.match(html, /Submit a fresh proposal/)
  }
})

test('cargo renders the linked driver and backend pickup eligibility', () => {
  const html = renderToStaticMarkup(createElement(Cargo, props()))
  assert.match(html, /Driver:/)
  assert.match(html, /Pickup is allowed/)
})

test('only operators are offered paid intelligence analysis controls', () => {
  for (const role of ['driver', 'captain']) {
    const html = renderToStaticMarkup(createElement(Intelligence, { token: 'test', user: { role }, shipments: [shipment] }))
    assert.doesNotMatch(html, /Analyze disruption/)
  }
  const html = renderToStaticMarkup(createElement(Intelligence, { token: 'test', user, shipments: [shipment] }))
  assert.match(html, /Analyze disruption/)
  assert.match(html, /Analysis may call paid services/)
})

test('readiness inputs belong to port while transport inputs belong to logistics', () => {
  const port = renderToStaticMarkup(createElement(IntelligenceInputs, { token: 'test', role: 'port', shipment }))
  const logistics = renderToStaticMarkup(createElement(IntelligenceInputs, { token: 'test', role: 'logistics', shipment }))
  assert.match(port, /Expected cargo readiness/)
  assert.doesNotMatch(port, /Cargo weight \(kg\)/)
  assert.match(logistics, /Cargo weight \(kg\)/)
  assert.doesNotMatch(logistics, /Expected cargo readiness/)
})

test('logistics can provide explicit fleet availability and capacity inputs', () => {
  const html = renderToStaticMarkup(createElement(FleetInputs, {
    token: 'test',
    vehicles: [{ id: 'T-1', name: 'Fleet truck' }]
  }))
  assert.match(html, /Vehicle available/)
  assert.match(html, /Capacity \(kg\)/)
  assert.match(html, /Availability starts/)
  assert.match(html, /Availability ends/)
  assert.match(html, /Refrigeration capability/)
  assert.match(html, /Confirmed starting coordinates/)
  assert.match(html, /Save fleet inputs/)
})

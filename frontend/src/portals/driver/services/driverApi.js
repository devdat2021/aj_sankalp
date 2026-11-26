import { initialAlerts, shipment } from '../data/mockData.js'
// Session-only demo store. Replace these async functions with FastAPI calls.
const delay = (ms = 450) => new Promise(resolve => setTimeout(resolve, ms))
let alerts = initialAlerts.map(alert => ({ ...alert, acknowledged: false }))
const incidents = []
export const driverApi = {
  async getShipment() { await delay(); return structuredClone(shipment) },
  async getAlerts() { await delay(); return structuredClone(alerts) },
  async acknowledgeAlert(id) {
    await delay(); alerts = alerts.map(alert => alert.id === id ? { ...alert, acknowledged: true } : alert)
    return structuredClone(alerts)
  },
  async reportIncident(input) {
    await delay()
    if (!input.description?.trim() || !input.location?.trim()) throw new Error('Description and location are required.')
    const incident = { ...input, id: `DEMO-${crypto.randomUUID().slice(0, 8)}`, timestamp: new Date().toISOString(), simulated: true }
    incidents.push(incident)
    return structuredClone(incident)
  },
  async sendDistress(location) {
    return this.reportIncident({ type: 'Distress signal', severity: 'critical', description: 'Demo SOS intended for Port Authority. No emergency service contacted.', location })
  },
  async requestReroute(route) {
    await delay(2200)
    const approved = route.conflicts.length === 0
    const response = { id: crypto.randomUUID(), severity: approved ? 'info' : 'warning', category: 'Authority · simulated',
      title: approved ? 'Rerouting approved · simulation' : 'Rerouting declined · simulation',
      message: approved ? `${route.name} approved for this demo. No simulated zones intersect its geometry. Real conditions and truck restrictions are unverified.` : `${route.name} intersects a simulated disruption zone. Choose another route.`, acknowledged: false }
    alerts = [response, ...alerts]
    return { approved, alert: structuredClone(response) }
  },
}

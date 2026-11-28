import { api } from '../../../services/api.js'

const categories = {
  'Vehicle breakdown': 'breakdown',
  'Breakdown': 'breakdown',
  'Flooding': 'flood',
  'Flood': 'flood',
  'Roadblock': 'roadblock',
  'Road obstruction': 'obstruction',
  'Refrigeration failure': 'refrigeration',
  'Refrigeration': 'refrigeration',
  'Other issue': 'breakdown',
  'Distress signal': 'distress',
  'Emergency SOS': 'distress'
}

export function createDriverApi(token) {
  return {
    getDashboard: () => api('/driver/dashboard', token),
    acknowledgeAlert: id => api(`/alerts/${id}/read`, token, 'PATCH'),
    async reportIncident(input, shipment) {
      const coordinates = input.location.split(',').map(Number)
      if (coordinates.length !== 2 || !coordinates.every(Number.isFinite)) throw new Error('Enter latitude, longitude as two numbers.')
      const row = await api('/incidents', token, 'POST', {
        shipment_id: shipment.id,
        category: categories[input.type] || input.category || input.type,
        severity: { info: 'low', warning: 'medium', critical: 'high' }[input.severity] || input.severity,
        description: input.description,
        lat: coordinates[0],
        lng: coordinates[1]
      })
      return { ...row, type: input.type, timestamp: row.created_at }
    },
    sendDistress(location, shipment) {
      return this.reportIncident({
        type: 'Distress signal',
        severity: 'critical',
        description: 'Driver requests urgent assistance. Internal notification; no emergency service contacted.',
        location
      }, shipment)
    },
    requestReroute(route, shipment, active, alternatives = []) {
      const ordered = [route, ...alternatives.filter(a => a.id !== route.id && a.safe !== false)]
      const options = ordered.slice(0, 4).map(opt => ({
        id: crypto.randomUUID(),
        name: opt.name,
        delay_hours: Math.max(0, Number(((opt.duration - (active?.duration || 0)) / 3600).toFixed(2))),
        cost: opt.id?.includes('inland') ? 1200 : 0,
        risk: opt.conflicts?.length ? 85 : 15,
        simulated: true,
        points: opt.points,
        distance: opt.distance,
        duration: opt.duration,
        source: opt.source
      }))
      const conflicts = route.conflicts?.length ? `Reported restrictions: ${route.conflicts.join(', ')}` : 'Safe alternative route requested'
      return api('/route-requests', token, 'POST', {
        shipment_id: shipment.id,
        reason: `Driver requests ${route.name}; ${conflicts}`,
        options
      })
    },
    updateLocation(lat, lng) {
      return api('/tracking/location', token, 'POST', { lat, lng, observed_at: new Date().toISOString() })
    },
    recordEvent(shipmentId, event) {
      return api(`/shipments/${shipmentId}/events`, token, 'POST', { event })
    }
  }
}

const KNOWN_DESTINATIONS = [
  [/udupi|manipal/i, [13.3409, 74.751]],
  [/kundapur/i, [13.6316, 74.69]],
  [/bhatkal/i, [13.985, 74.556]],
  [/karwar/i, [14.8136, 74.1297]],
  [/mangal/i, [12.9141, 74.856]],
  [/kochi|cochin/i, [9.9312, 76.2673]],
  [/chennai/i, [13.0827, 80.2707]],
  [/mumbai|jnpt|nhava/i, [18.949, 72.951]],
  [/goa|panaji|mormugao/i, [15.411, 73.7997]],
  [/bengaluru|bangalore/i, [12.9716, 77.5946]],
]

function resolveDestinationCoords(destination) {
  if (!destination) return null
  const hit = KNOWN_DESTINATIONS.find(([re]) => re.test(destination))
  return hit ? hit[1] : null
}

export function driverShipment(row, data, user) {
  const truck = data.vehicles?.find(v => v.id === row.truck_id)
  const accessSlot = (data.port_requests || []).find(r => r.shipment_id === row.id && r.kind === 'truck_access' && r.status === 'approved')?.slot
  const activeHazards = (data.incidents || []).filter(i => i.shipment_id === row.id && i.category !== 'delay' && ['reported', 'confirmed'].includes(i.status))
  const isStopped = row.hazard_stopped ?? Boolean(truck?.status === 'Stopped / Unable to continue' || activeHazards.length > 0)
  return {
    ...row,
    origin: row.origin || data.port.name,
    weight: `${row.quantity} tonnes`,
    refrigerated: row.requires_cold,
    pickup: [data.port.lat, data.port.lng],
    location: truck ? [truck.lat, truck.lng] : [data.port.lat, data.port.lng],
    dropoff: row.destination_location || resolveDestinationCoords(row.destination),
    driver: user.name,
    vehicle: truck?.name || row.truck_id,
    status: isStopped ? 'Stopped / Unable to continue' : row.status.replaceAll('_', ' '),
    hazard_stopped: isStopped,
    hazard_reason: row.hazard_reason || activeHazards[0]?.description || (isStopped ? 'Hazard reported on route' : null),
    access_slot: accessSlot
  }
}

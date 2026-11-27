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
    requestReroute(route, shipment, active) {
      return api('/route-requests', token, 'POST', {
        shipment_id: shipment.id,
        reason: `Driver requests ${route.name}; ${route.conflicts.length ? route.conflicts.join(', ') : 'alternative route for logistics review'}`,
        options: [{
          id: crypto.randomUUID(),
          name: route.name,
          delay_hours: Math.max(0, (route.duration - (active?.duration || 0)) / 3600),
          cost: 0,
          risk: route.conflicts.length ? 75 : 25,
          simulated: true,
          points: route.points,
          distance: route.distance,
          duration: route.duration,
          source: route.source
        }]
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

export function driverShipment(row, data, user) {
  const truck = data.vehicles?.find(v => v.id === row.truck_id)
  const coastalDemo = /udupi/i.test(row.destination)
  const accessSlot = (data.port_requests || []).find(r => r.shipment_id === row.id && r.kind === 'truck_access' && r.status === 'approved')?.slot
  const activeHazards = (data.incidents || []).filter(i => i.shipment_id === row.id && ['reported', 'confirmed'].includes(i.status))
  const isStopped = Boolean(row.hazard_stopped || truck?.status === 'Stopped / Unable to continue' || activeHazards.length > 0)
  return {
    ...row,
    origin: row.origin || data.port.name,
    weight: `${row.quantity} tonnes`,
    refrigerated: row.requires_cold,
    pickup: [data.port.lat, data.port.lng],
    location: truck ? [truck.lat, truck.lng] : [data.port.lat, data.port.lng],
    dropoff: row.destination_location || (coastalDemo ? [13.3409, 74.751] : null),
    driver: user.name,
    vehicle: truck?.name || row.truck_id,
    status: isStopped ? 'Stopped / Unable to continue' : row.status.replaceAll('_', ' '),
    hazard_stopped: isStopped,
    hazard_reason: row.hazard_reason || activeHazards[0]?.description || (isStopped ? 'Hazard reported on route' : null),
    access_slot: accessSlot
  }
}


import { disruptions } from '../data/mockData.js'

export function buildHazardZones(activeIncidents = [], demo = false) {
  const incidentZones = (activeIncidents || [])
    .filter(inc => ['reported', 'confirmed'].includes(inc.status) && ['flood', 'roadblock', 'obstruction'].includes(inc.category) && inc.lat != null && inc.lng != null)
    .map(inc => ({
      id: `inc-${inc.id}`,
      title: `${inc.category.charAt(0).toUpperCase() + inc.category.slice(1)}: ${inc.description}`,
      center: [Number(inc.lat), Number(inc.lng)],
      radius: inc.category === 'flood' ? 1600 : 800,
      severity: inc.severity === 'high' ? 'critical' : 'warning',
    }))
  return demo ? [...disruptions, ...incidentZones] : incidentZones
}

// Check segments as well as vertices against circular disruption/hazard zones.
export function findConflicts(points, zones = disruptions) {
  if (!points || points.length < 2) return []
  return zones.filter(zone => {
    const project = p => [(p[1] - zone.center[1]) * 111320 * Math.cos(zone.center[0] * Math.PI / 180), (p[0] - zone.center[0]) * 111320]
    return points.slice(1).some((point, i) => {
      const a = project(points[i]); const b = project(point)
      const dx = b[0] - a[0]; const dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(a[0] + t * dx, a[1] + t * dy) <= zone.radius
    })
  }).map(zone => zone.title)
}

const decorate = (route, zones) => {
  const conflicts = findConflicts(route.points, zones)
  return { ...route, conflicts, safe: conflicts.length === 0 }
}

const cachedRoutes = new Map()

async function fetchRoute(points, prefix, name, zones) {
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=true`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('Routing service unavailable')
  const data = await response.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No road route returned')
  return data.routes.slice(0, 2).map((route, index) => {
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration) || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) throw new Error('Invalid routing response')
    return decorate({ id: `${prefix}-${index}`, name: `${name}${index ? ' alternative' : ''}`, distance: route.distance, duration: route.duration, points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), source: 'OSRM road route' }, zones)
  })
}

export async function getRoutes(shipment, activeIncidents = [], demo = false) {
  const zones = buildHazardZones(activeIncidents, demo)
  const key = JSON.stringify([shipment.location, shipment.dropoff])
  const results = await Promise.allSettled([
    fetchRoute([shipment.location, shipment.dropoff], 'road', 'Coastal road', zones),
    fetchRoute([shipment.location, [13.045, 74.85], [13.12, 74.89], [13.24, 74.85], shipment.dropoff], 'inland', 'Inland diversion', zones),
  ])
  let roads = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (roads.length) {
    cachedRoutes.set(key, roads)
  } else if (cachedRoutes.has(key)) {
    roads = cachedRoutes.get(key).map(route => decorate({ ...route, source: 'Cached OSRM road route' }, zones))
  }

  // Sort safe routes first
  roads.sort((a, b) => Number(b.safe) - Number(a.safe))
  const safeCount = roads.filter(r => r.safe).length
  const allBlocked = roads.length > 0 && safeCount === 0

  let notice
  if (allBlocked) {
    notice = 'No safe route available. Logistics intervention required.'
  } else if (!roads.length) {
    notice = 'Road routes unavailable. Contact logistics for route instructions.'
  } else {
    notice = `${safeCount} safe route option(s) available. Blocked/flooded coastal corridors are flagged and excluded from approval.`
  }

  return { routes: roads, safeRoutes: roads.filter(r => r.safe), allBlocked, notice, zones }
}

import { disruptions, shipment } from '../data/mockData.js'
// Check segments as well as vertices against small local circular demo zones.
export function findConflicts(points, zones = disruptions) {
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
const decorate = route => ({ ...route, conflicts: findConflicts(route.points) })
const fallback = () => [
  { id: 'demo-coastal', name: 'Coastal corridor', distance: 41000, duration: 3600, points: [shipment.location, [13.095, 74.79], [13.18, 74.78], [13.26, 74.76], shipment.dropoff] },
  { id: 'demo-inland', name: 'Inland diversion', distance: 58000, duration: 5100, points: [shipment.location, [13.045, 74.85], [13.12, 74.89], [13.24, 74.85], [13.31, 74.8], shipment.dropoff] },
].map(route => decorate({ ...route, source: 'Simulated schematic · not road navigation' }))
let cachedRoutes
async function fetchRoute(points, prefix, name) {
  const coords = points.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&alternatives=true`, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('Routing service unavailable')
  const data = await response.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No road route returned')
  return data.routes.slice(0, 2).map((route, index) => {
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration) || !route.geometry?.coordinates || route.geometry.coordinates.length < 2) throw new Error('Invalid routing response')
    return decorate({ id: `${prefix}-${index}`, name: `${name}${index ? ' alternative' : ''}`, distance: route.distance, duration: route.duration, points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), source: 'OSRM road route' })
  })
}
export async function getRoutes() {
  const results = await Promise.allSettled([
    fetchRoute([shipment.location, shipment.dropoff], 'road', 'Coastal road'),
    fetchRoute([shipment.location, [13.12, 74.89], [13.24, 74.85], shipment.dropoff], 'inland', 'Inland road'),
  ])
  const roads = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (roads.length) {
    cachedRoutes = roads
    return { routes: roads.length > 1 ? roads : [...roads, fallback()[1]], notice: results.some(r => r.status === 'rejected') ? 'Some OSRM requests failed. Available routes shown; schematic fallback may be included.' : 'Road geometry from OSRM. Traffic, flooding and truck restrictions are not included by OSRM.' }
  }
  return { routes: cachedRoutes ? cachedRoutes.map(route => ({ ...route, source: 'Cached OSRM road route' })) : fallback(), notice: cachedRoutes ? 'OSRM unavailable. Showing routes cached in this session.' : 'OSRM unavailable. Dashed schematic routes are simulated and do not follow verified roads.' }
}

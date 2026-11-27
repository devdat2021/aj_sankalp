import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, GeoJSON, Pane, Tooltip, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { LocateFixed, Scan, Truck, MapPin, Layers } from 'lucide-react'
import coast from '../data/coastal-overview.json'
import 'leaflet/dist/leaflet.css'


function MapView({ routes, shipment, activeId }) {
  const map = useMap()
  const framedTrip = useRef(null)
  const points = useMemo(() => [shipment.pickup, shipment.location, ...(shipment.dropoff ? [shipment.dropoff] : []), ...routes.flatMap(route => route.points)], [shipment, routes])
  const routeIds = routes.map(route => route.id).join('|')
  const frame = () => map.fitBounds(points, { padding: [48, 56], maxZoom: 14, animate: false })
  useEffect(() => {
    const trip = shipment.id + ':' + activeId + ':' + routeIds
    if (framedTrip.current !== trip) {
      framedTrip.current = trip
      map.fitBounds(points, { padding: [48, 56], maxZoom: 14, animate: false })
    }
  }, [map, shipment.id, activeId, points, routeIds])
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return <div className="drive-map-tools">
    <button onClick={() => map.setView(shipment.location, 14)} aria-label="Center on truck" title="Center on truck"><LocateFixed size={21}/></button>
    <button onClick={frame} aria-label="Fit whole trip" title="Fit whole trip"><Scan size={21}/></button>
  </div>
}
export default function NavigationMap({ shipment, routes, activeId, selectedId, zones, requested }) {
  const [tileError, setTileError] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const ordered = [...routes].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
  return <div className="map-shell">
    {tileError && <div className="tile-warning" role="status">Street tiles unavailable · overview only</div>}
    <MapContainer center={shipment.location} zoom={10} zoomSnap={0.25} scrollWheelZoom={false} className="driver-map">
      <Pane name="regional-overview" style={{zIndex: 180, pointerEvents: 'none'}}>
        <GeoJSON data={coast} interactive={false} attribution="Regional overview: Natural Earth" style={feature => {
          if (feature.properties.layer === 'roads') return {color:'#fff9e5', weight:3, opacity:1}
          const land = feature.properties.layer === 'land'
          return {color:land ? '#afc9b8' : '#cbcfbd', weight:1, fillColor:land ? '#dce5d1' : '#cdd3c2', fillOpacity:1}
        }}/>
      </Pane>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }}/>
      <MapView routes={routes} shipment={shipment} activeId={activeId}/>
      {ordered.map(route => {
        const blocked = Boolean(route.conflicts?.length)
        const approved = route.id === activeId
        const preview = route.id === selectedId
        const label = blocked ? 'Blocked route' : approved ? 'Approved route' : preview ? 'Selected preview' : 'Alternative route'
        return <Polyline key={route.id} positions={route.points} pathOptions={{
          color: blocked ? '#b91c1c' : approved ? '#047857' : preview ? '#1d4ed8' : '#71717a',
          weight: approved ? 6 : 4, dashArray: blocked ? '3 8' : approved ? undefined : '9 7',
        }}><Popup>{label} · {route.name}<br/>{route.source}</Popup></Polyline>
      })}
      {requested?.points?.length > 1 && <Polyline positions={requested.points} pathOptions={{color: '#92400e', weight: 3, dashArray: '2 8'}}><Popup>Awaiting approval · {requested.name}</Popup></Polyline>}
      {zones.map(zone => <Circle key={zone.id} center={zone.center} radius={zone.radius} pathOptions={{color: '#b91c1c', fillOpacity: 0.16}}><Popup>{zone.title}<br/>{zone.id.startsWith('inc-') ? 'Reported disruption' : 'Simulated disruption'}</Popup></Circle>)}
      {shipment.dropoff && <CircleMarker center={shipment.dropoff} radius={8} pathOptions={{color:'#fff', weight:3, fillColor:'#172e28', fillOpacity:1}}>
        <Tooltip permanent direction="top" offset={[0,-7]} className="drive-pin destination-pin"><MapPin size={14}/>{shipment.destination}</Tooltip>
      </CircleMarker>}
      <CircleMarker center={shipment.pickup} radius={6} pathOptions={{color:'#fff', weight:2, fillColor:'#52525b', fillOpacity:1}}><Popup>Pickup · {shipment.origin}</Popup></CircleMarker>
      <CircleMarker center={shipment.location} radius={10} pathOptions={{color:'#fff', weight:3, fillColor:'#047857', fillOpacity:1}}>
        <Tooltip permanent direction="bottom" offset={[0,9]} className="drive-pin truck-pin"><Truck size={15}/>{shipment.vehicle || 'Truck'}</Tooltip>
      </CircleMarker>
    </MapContainer>
    <button className="map-key-toggle" aria-expanded={legendOpen} onClick={() => setLegendOpen(!legendOpen)}><Layers size={17}/> Map key</button>
    {legendOpen && <div className="map-legend"><span><i className="active-line"/>Approved</span><span><i className="alternative-line"/>Alternative</span><span><i className="preview-line"/>Preview</span><span><i className="zone-dot"/>Disruption</span><span><i className="blocked-line"/>Blocked</span>{requested?.points?.length > 1 && <span><i className="requested-line"/>Requested</span>}</div>}
  </div>
}

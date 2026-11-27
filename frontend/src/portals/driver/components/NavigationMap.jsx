import { useEffect, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { LocateFixed } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { disruptions } from '../data/mockData'

function MapView({ routes, shipment }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds([shipment.pickup, shipment.dropoff, ...routes.flatMap(route => route.points)], { padding: [35, 35] })
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map, routes, shipment])
  return <button className="map-locate" onClick={() => map.setView(shipment.location, 13)} aria-label="Center on simulated truck"><LocateFixed size={20}/></button>
}
export default function NavigationMap({ shipment, routes, activeId, selectedId }) {
  const [tileError, setTileError] = useState(false)
  const ordered = [...routes].sort((a, b) => Number(a.id === activeId) - Number(b.id === activeId))
  return <div className="map-shell">
    {tileError && <div className="tile-warning" role="status">Map tiles unavailable. Route overlays remain visible; check your connection.</div>}
    <MapContainer center={[13.18, 74.8]} zoom={10} scrollWheelZoom={false} className="driver-map">
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true) }}/>
      <MapView routes={routes} shipment={shipment}/>
      {ordered.map(route => <Polyline key={route.id} positions={route.points} pathOptions={{ color: route.id === activeId ? '#087f86' : route.id === selectedId ? '#183451' : '#7e8da8', weight: route.id === activeId ? 6 : 4, opacity: 0.9, dashArray: route.source.startsWith('Simulated') || (route.id === selectedId && route.id !== activeId) ? '8 9' : undefined }}><Popup>{route.name}<br/>{route.source}</Popup></Polyline>)}
      {disruptions.map(zone => <Circle key={zone.id} center={zone.center} radius={zone.radius} pathOptions={{ color: '#dc5345', fillOpacity: 0.22 }}><Popup><strong>{zone.title}</strong><br/>Simulated disruption zone</Popup></Circle>)}
      {[[shipment.pickup, 'Pickup · New Mangalore Port', '#183451'], [shipment.dropoff, 'Destination · Udupi Cold Storage (demo)', '#183451'], [shipment.location, 'Truck · simulated current location', '#087f86']].map(([position, label, color]) => <CircleMarker key={label} center={position} radius={9} pathOptions={{ color: 'white', weight: 3, fillColor: color, fillOpacity: 1 }}><Popup>{label}</Popup></CircleMarker>)}
    </MapContainer>
    <div className="map-legend"><span><i className="active-line"/>Active route</span><span><i className="alternative-line"/>Alternative</span><span><i className="preview-line"/>Preview</span><span><i className="zone-dot"/>Demo disruption</span></div>
  </div>
}

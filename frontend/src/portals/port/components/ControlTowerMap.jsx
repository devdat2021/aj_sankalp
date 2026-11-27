import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function MapController({ points, portCenter, fitNonce, mode }) {
  const map = useMap();

  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(t);
  }, [map]);

  useEffect(() => {
    if (mode === 'port' && portCenter) {
      map.setView(portCenter, 11, { animate: true });
      return;
    }
    if (points.length >= 2) {
      map.fitBounds(points, { padding: [36, 36], maxZoom: 12 });
    } else if (portCenter) {
      map.setView(portCenter, 10);
    }
  }, [map, points, portCenter, fitNonce, mode]);

  return null;
}

export default function ControlTowerMap({ data }) {
  const [filter, setFilter] = useState('all');
  const [fitNonce, setFitNonce] = useState(0);
  const [viewMode, setViewMode] = useState('fit');

  const port = data?.port;
  const portLat = port?.lat;
  const portLng = port?.lng;
  const portCenter = useMemo(
    () => (portLat && portLng ? [portLat, portLng] : [12.927, 74.81]),
    [portLat, portLng]
  );

  const vessels = useMemo(() => (data?.vessels || []).filter(v => v.lat != null && v.lng != null), [data?.vessels]);
  const vehicles = useMemo(() => (data?.vehicles || []).filter(v => v.lat != null && v.lng != null), [data?.vehicles]);
  const incidents = useMemo(
    () => (data?.incidents || []).filter(x => x.status !== 'rejected' && x.lat != null && x.lng != null),
    [data?.incidents]
  );

  const visibleVessels = useMemo(() => (filter === 'all' || filter === 'vessels' ? vessels : []), [filter, vessels]);
  const visibleVehicles = useMemo(() => (filter === 'all' || filter === 'trucks' ? vehicles : []), [filter, vehicles]);
  const visibleIncidents = useMemo(() => (filter === 'all' || filter === 'incidents' ? incidents : []), [filter, incidents]);

  const allPoints = useMemo(() => {
    const isIndia = (lat, lng) => lat >= 5 && lat <= 37 && lng >= 67 && lng <= 98;
    const pts = [portCenter];
    for (const v of visibleVessels) if (isIndia(v.lat, v.lng)) pts.push([v.lat, v.lng]);
    for (const t of visibleVehicles) if (isIndia(t.lat, t.lng)) pts.push([t.lat, t.lng]);
    for (const i of visibleIncidents) if (isIndia(i.lat, i.lng)) pts.push([i.lat, i.lng]);
    return pts;
  }, [portCenter, visibleVessels, visibleVehicles, visibleIncidents]);

  const shipments = data?.shipments || [];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[
            ['all', `All (${vessels.length + vehicles.length + incidents.length})`],
            ['vessels', `Vessels (${vessels.length})`],
            ['trucks', `Trucks (${vehicles.length})`],
            ['incidents', `Incidents (${incidents.length})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? '' : 'secondary'}
              style={{ padding: '5px 10px', fontSize: 12, margin: 0 }}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="secondary"
            style={{ padding: '5px 10px', fontSize: 12, margin: 0 }}
            onClick={() => { setViewMode('fit'); setFitNonce(n => n + 1); }}
          >
            Fit all
          </button>
          <button
            type="button"
            className="secondary"
            style={{ padding: '5px 10px', fontSize: 12, margin: 0 }}
            onClick={() => { setViewMode('port'); setFitNonce(n => n + 1); }}
          >
            Center on port
          </button>
        </div>
      </div>

      <MapContainer center={portCenter} zoom={10} scrollWheelZoom={true} style={{ height: 380, width: '100%', borderRadius: 8 }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController points={allPoints} portCenter={portCenter} fitNonce={fitNonce} mode={viewMode} />

        {port && (
          <CircleMarker
            center={portCenter}
            radius={12}
            pathOptions={{ color: '#0f172a', fillColor: '#10b981', fillOpacity: 0.9, weight: 2 }}
          >
            <Tooltip>{port.name} ({port.id})</Tooltip>
            <Popup>
              <strong>{port.name} ({port.id})</strong><br />
              Status: {port.status}<br />
              Berths free: {(port.berths || 0) - (port.occupied_berths || 0)} / {port.berths || 0}<br />
              Cold storage free: {(port.cold_capacity || 0) - (port.cold_occupied || 0)} / {port.cold_capacity || 0} t
            </Popup>
          </CircleMarker>
        )}

        {visibleVessels.map(v => {
          const onboard = shipments.filter(s => s.vessel_id === v.id);
          return (
            <CircleMarker
              key={v.id}
              center={[v.lat, v.lng]}
              radius={9}
              pathOptions={{ color: '#087e8b', fillColor: '#087e8b', fillOpacity: 0.85 }}
            >
              <Tooltip>{v.name} ({v.movement_status || v.status})</Tooltip>
              <Popup>
                <strong>🚢 {v.name} ({v.id})</strong><br />
                Status: {v.movement_status || v.status}<br />
                {v.eta && <>ETA: {v.eta}<br /></>}
                Onboard cargo: {onboard.length} consignment(s)
              </Popup>
            </CircleMarker>
          );
        })}

        {visibleVehicles.map(t => (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lng]}
            radius={8}
            pathOptions={{ color: '#254ba6', fillColor: '#254ba6', fillOpacity: 0.85 }}
          >
            <Tooltip>{t.name} ({t.status})</Tooltip>
            <Popup>
              <strong>🚚 {t.name} ({t.id})</strong><br />
              Status: {t.status}<br />
              Position: {t.lat.toFixed(3)}, {t.lng.toFixed(3)}
            </Popup>
          </CircleMarker>
        ))}

        {visibleIncidents.map(i => (
          <CircleMarker
            key={i.id}
            center={[i.lat, i.lng]}
            radius={10}
            pathOptions={{ color: '#9a3412', fillColor: '#e56a37', fillOpacity: 0.9 }}
          >
            <Tooltip>⚠ {i.category} ({i.severity})</Tooltip>
            <Popup>
              <strong>⚠ {i.category.replaceAll('_', ' ').toUpperCase()} ({i.severity})</strong><br />
              Shipment: {i.shipment_id} · Status: {i.status}<br />
              {i.description}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

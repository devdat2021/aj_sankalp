export const shipment = {
  id: 'CW-2026-0842', cargo: 'Fresh seafood', weight: '8,400 kg', refrigerated: true,
  origin: 'New Mangalore Port', destination: 'Udupi Cold Storage',
  pickup: [12.927, 74.812], location: [13.025, 74.795], dropoff: [13.3409, 74.751],
  driver: 'Arjun Kumar', vehicle: 'KA 19 AB 4821', status: 'In transit',
}
export const disruptions = [
  { id: 'flood', title: 'Flooding near Mulki', center: [13.095, 74.79], radius: 1600, severity: 'critical' },
  { id: 'closure', title: 'Local road closed · Kaup', center: [13.224, 74.745], radius: 650, severity: 'warning' },
]
export const initialAlerts = [
  { id: 'a1', severity: 'critical', title: 'Flooding reported near Mulki', message: 'Simulated flooding affects the coastal corridor. Review alternatives and request authority approval.', category: 'Road disruption' },
  { id: 'a2', severity: 'warning', title: 'Heavy rainfall advisory', message: 'Reduced visibility expected along the coast. Maintain distance and allow extra travel time.', category: 'Weather' },
  { id: 'a3', severity: 'info', title: 'Keep the cold chain intact', message: 'Demo cargo target: 0–4°C. Report refrigeration faults immediately.', category: 'Shipment' },
  { id: 'a4', severity: 'info', title: 'Confirm route changes before departure', message: 'Port authority instruction: request rerouting approval before activating a different route.', category: 'Authority' },
]

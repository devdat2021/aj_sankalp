# CoastWatch-SCM driver demo

Run `npm install`, then `npm run dev` from `frontend`. Open the printed URL at `/driver`; `/` redirects there. `npm run build` builds production assets, `npm run preview` serves them, and `npm run lint` checks JavaScript. Production hosts must rewrite unknown application paths to `index.html` for direct `/driver` visits.

## Structure and data flow

- `src/App.jsx`: minimal React Router configuration.
- `src/portals/driver/DriverPortal.jsx`: loads shipment, alerts and routes; owns selected/active route and workflow state.
- `components/`: shipment, Leaflet map, route choices, incident form, accessible native dialogs, SOS confirmation and alerts.
- `data/mockData.js`: shipment, fixed simulated truck position, circular flooding/closure zones and initial alerts.
- `services/driverApi.js`: async, session-only shipment, alerts, acknowledgement, incident, distress and authority response operations. Replace these methods with shared FastAPI requests later. Reloading resets demo changes; there is no database or authentication.
- `services/routing.js`: OSRM requests, session cache, schematic fallback routes and segment-to-circle disruption checks.
- `driver.css`: portal-scoped interface styles. Tailwind utilities are enabled without a global preflight reset, keeping future portals independent.

## Demo walkthrough

The Fleet Cockpit layout places a compact trip-and-route rail beside the map on desktop and tablet. On mobile, tap the destination summary to expand or collapse the bottom sheet, then use Trip, Routes or Alerts. Report incident and demo SOS remain available in the bottom action bar. Unacknowledged critical alerts appear above the map; all alerts remain in the Alerts panel.

1. View the refrigerated seafood shipment from New Mangalore Port to a fictional Udupi cold-storage facility. Temperature fluctuates within a simulated 1.8–3.2°C range. The truck position stays fixed; this is not live tracking.
2. Inspect flooding near Mulki and a local closure near Kaup on the map. Select an alternative to preview it as a navy dashed line. Active routes are teal; other alternatives are grey-blue.
3. Request rerouting. After a simulated delay, the authority approves a geometry that does not intersect the demo zones, or declines one that does. Approved routes become active and update distance/ETA; responses appear in alerts. Refreshing routes restores the default assignment and requires a new alternative approval.
4. Acknowledge alerts, report an incident, or confirm a demo SOS. Reports include type, severity, description, editable location and an automatic timestamp. Confirmation displays the demo report ID. SOS creates a critical incident, but contacts no real authority or emergency service.

## Routing and limitations

Actual road geometry, distance and duration come from the public OSRM driving service, with an inland waypoint request as an additional alternative. The source is labeled on each option. Requests time out after 10 seconds; failures use session-cached OSRM data or explicitly marked dashed schematic routes. Schematic lines are not verified roads. Map tiles require connectivity; a tile failure displays a warning while retaining overlays.

Every route is checked against the simulated circular zones, including segment crossings between vertices. No route is called safe. OSRM does not know these incidents, current traffic, vehicle restrictions or real emergency conditions. The estimated arrival uses the demo start time plus route duration in IST. Pickup is displayed separately; routing begins at the simulated current position.

Dependencies follow the [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite) and [OSRM route API](https://project-osrm.org/docs/v5.24.0/api/). No API keys, backend, Authority/Captain portals or ChainMind integration are included.

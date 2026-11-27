# CoastWatch frontend

Four backend-connected workspaces: `/logistics`, `/port`, `/driver`, `/captain`. The home page provides local demo entry when Supabase is not configured. A shared session provider obtains identity from `GET /api/me`; role routes redirect to the authenticated user's workspace. All operational reads and writes go through FastAPI.

## Run

Start the backend on 127.0.0.1:8001, then run `npm ci` (if dependencies are absent) and `npm run dev` in this folder. Vite proxies `/api` to the backend. Open http://127.0.0.1:5173. Use `npm run build`, `npm run lint`, and `node --test tests/api.test.js tests/driverApi.test.js` to validate changes.

## Supabase setup, when ready

Copy `.env.example` to `.env.local`, then set:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_ENABLE_DEMO=false
```

Restart Vite after configuration changes. Both Supabase values must be present to enable email/password sign-in. The existing Supabase SDK restores sessions and refreshes tokens; every API request sends the bearer token. The frontend does not assign roles or read operational data directly from Supabase. Never put a service-role key or MongoDB URI in a VITE variable.

Configure the matching backend SUPABASE_URL and trusted user records as described in `../backend/README.md`. Each auth subject needs an active mapping with role and company/port/asset assignment. Enable email/password auth and create the accounts in Supabase. Disable backend DEMO_MODE outside local demonstration. No Supabase credentials or accounts were created by this update; live Supabase login must be tested after configuration.

Development demo access requires backend DEMO_MODE=true. Demo credentials are held in tab session storage. Production builds hide demo entry unless VITE_ENABLE_DEMO=true is deliberately set. Demo login is never offered when Supabase is configured. Demo mode uses the configured backend storage, including Atlas when configured; it is not automatically an isolated database.

For deployed frontend/backend origins set VITE_API_BASE_URL to the backend origin, allow the frontend origin in backend CORS_ORIGINS, and configure SPA fallback to index.html on the frontend host.

## Workspaces

- Logistics: create cargo, assign trucks/routes, request handling and truck access, decide reroutes, track assigned assets, read notifications.
- Port Operations: review handling/access/docking requests, select approved times and berths, maintain capacity, review incidents, publish warnings, mark unloading/readiness, view audit and simulation.
- Driver: assigned cargo and route, incident/reroute reporting, manual location updates, pickup/delivery, individual warning acknowledgment.
- Captain: vessel manifest, docking request/status, actual movement events, manual location and incident reporting.

Dashboards refresh every eight seconds while visible and after writes. Weather refreshes every ten minutes and supports land/marine forecasts with source, timestamps and stale/unavailable states. Dates are entered/displayed locally and submitted as UTC ISO timestamps. Forms preserve errors and disable controls during submission. Capacity and authorization failures are shown from the backend.

`Workspace.jsx` applies the shared authentication/role guard and mounts the incoming `PortPortal` and `DriverPortal`. Shared Requests, Cargo, Operations, Weather and form components are reused within those interfaces. Logistics and captain keep their existing workspaces. Crisis requests reuse the common API transport and current bearer token; there is one Supabase session lifecycle.

The port Crisis Simulator includes disruption analysis, what-if comparison, history, network overview, fleet/cold-chain risk and recovery strategies. Its synthetic SQL dataset is separate from operational MongoDB records. The original lightweight operational simulation remains available under Simulation.

The driver Fleet Cockpit loads backend assignments and warnings, persists incidents and reroute requests, and displays approved route geometry after reload. OSRM road alternatives (or a labeled demo fallback) require logistics approval. Unknown destinations without coordinates do not receive a fabricated route. Positions remain seeded or manually reported, with no automatic GPS/AIS feed. Docking compatibility remains an operator decision.

## Verification

Run the frontend tests, lint and build above and the backend suite. The integration adds coverage for driver reporting, approval ownership, persisted geometry and both API families. Crisis simulation execution/history and shared port Requests were smoke-tested in the browser with isolated temporary storage. Atlas was checked separately with a read-only ping/collection query. Supabase login is wired but not verified against an account yet. The lazy crisis bundle triggers a non-blocking Vite size warning.

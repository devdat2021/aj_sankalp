# CoastWatch frontend

Four backend-connected workspaces: `/logistics`, `/port`, `/driver`, `/captain`. The home page provides local demo entry when Supabase is not configured. A shared session provider obtains identity from `GET /api/me`; role routes redirect to the authenticated user's workspace. All operational reads and writes go through FastAPI.

## Run

Start the backend on 127.0.0.1:8001, then run `npm ci` (if dependencies are absent) and `npm run dev` in this folder. Vite proxies `/api` to the backend. Open http://127.0.0.1:5173. Use `npm run build`, `npm run lint`, and `node --test tests/api.test.js` to validate changes.

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

The active frontend now uses `components/Workspace.jsx` and shared workflow components. Earlier portal demo files remain in the tree for reference but are not mounted by App.jsx. Map positions are seeded or manually reported; there is no automatic GPS/AIS feed. Road options are operator-supplied estimates, not generated turn-by-turn routes. Docking compatibility remains an operator decision.

## Verification

Frontend build/lint and the backend suite pass. Browser smoke checks exercised all four demo roles, logistics reroute approval, port warning delivery, driver acknowledgment, captain docking request, port handling and docking approvals (including slot/berth), and live land weather. Browser checks used isolated local JSON state; Atlas was checked separately with a read-only ping/collection query. Supabase login is wired but not verified against an account yet.

# CoastWatch coordination backend

FastAPI backend for four roles: Port Operations, logistics company, truck driver and vessel captain. Operational data is shared; access is filtered by port, company or assigned asset. Supabase supplies identity, and trusted server-side user mappings supply permissions.

## Run and test

From the repository root (PowerShell):

```powershell
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
# In another terminal, from backend:
../.venv/Scripts/python.exe -m pytest -q
```

Interactive API contracts: http://127.0.0.1:8001/docs. Copy `.env.example` to `.env` to configure Atlas and Supabase. Disable DEMO_MODE outside local development. Demo bearer tokens: `local-port-demo`, `local-logistics-demo`, `local-driver-demo`, `local-captain-demo`. Driver and captain demo accounts own TRK-101 and VES-101 respectively; logistics owns LOG-101. Production mappings require `auth_user_id`, `active`, `role`, and the corresponding `company_id`, `port_id` or `asset_id`. Asset records also identify their driver/captain.

## Decision ownership

The Phase 1 logistics ownership rules, existing data fields, shared event names and deferred contract questions are documented in [LOGISTICS_CONTRACT.md](LOGISTICS_CONTRACT.md).

- Logistics creates consignments, assigns company trucks and routes, and approves driver reroutes. Ports and drivers cannot approve road changes.
- Port Operations approves separate handling and truck-access requests, updates capacity, publishes warnings, and approves docking requests.
- Captains request docking and record actual vessel departure, arrival and docking. Approval alone does not create a movement event.
- Port Operations records unloading and pickup readiness. Drivers record pickup and delivery. Pickup requires approval for the currently assigned truck.
- One warning has multiple scoped recipients, each with an independent acknowledgment. Company users see only their consignments, including when vessels carry cargo for multiple companies.

## API map (all paths start with /api)

| Endpoint | Purpose |
| --- | --- |
| GET /me, GET /{role}/dashboard | Identity and scoped dashboard |
| POST /shipments, GET /shipments/{id} | Create/view consignment |
| PUT /shipments/{id}/assignment | Logistics assigns truck and initial route |
| POST/GET /route-requests, PATCH /route-requests/{id} | Driver request; logistics decision |
| POST/GET /port-requests, PATCH /port-requests/{id} | Handling or truck access; port decision |
| GET/PATCH /ports/{id}/capacity | Shared capacity view; port update |
| POST/GET /docking-requests, PATCH /docking-requests/{id} | Captain request; port berth/slot decision |
| POST /vessels/{id}/events | departed, arrived, docked |
| POST /shipments/{id}/events | unloaded, ready_for_pickup, picked_up, delivered |
| POST /tracking/location | Own asset position; rejects stale/future observations |
| POST/GET /incidents, PATCH /incidents/{id} | Report/feed; port review |
| POST/GET /alerts, PATCH /alerts/{id}/read | Port warnings and recipient acknowledgment |
| GET /ports/{id}/weather?mode=land or marine | Port-location Open-Meteo forecast |
| POST /simulation/run | Read-only port impact estimate |

Use timezone-aware ISO timestamps; new workflow timestamps normalize to UTC. Consignment quantity and refrigerated capacity use tonnes in this MVP. Docking berths are B1 through B{configured berth count}. Refrigerated cargo sorts ahead of standard requests, then by request time; the operator confirms compatibility. Docking requires handling approval for linked inbound cargo. Reservations consume capacity immediately and are released on pickup/departure. This is conservative reservation accounting, not a calendar-based berth scheduler.

## Storage and migration

The existing versioned Atlas `port_state` aggregate is retained under `_id: NMP`, allowing approval, capacity, notification and audit updates to commit together. Concurrent Atlas writes return 409; local JSON is single-process demo storage. Schema-v1 records migrate lazily to v2 without deleting records. Existing legacy shipments/trucks are mapped to the demo company LOG-101; old alerts remain port-scoped. New demo users are added only in demo mode. Review these legacy ownership mappings before using real operational data. Back up existing storage before first deployment of a new schema.

## Boundaries

This implementation supports one configured port with multiple company/asset scopes. It does not provide a tenant-administration UI, multi-port voyage scheduling, customs clearance, live AIS/GPS ingestion, verified navigation, automatic route generation, or emergency-service dispatch. Route candidates are supplied through the API and require logistics review. Vessel docking safety/compatibility is operator-confirmed; priority is a simple refrigerated-cargo heuristic.

Weather has an eight-second timeout and ten-minute in-memory cache. Cached forecasts are labeled stale on provider failure; otherwise the endpoint returns 503. Incident persistence is independent of weather. Tests mock the provider; live provider availability is not guaranteed.

The frontend now connects all four role workspaces to these APIs, including port approval forms, driver reports, logistics routing decisions, captain movement events and weather. See ../frontend/README.md for Supabase setup and frontend limitations.

## Crisis simulation integration

`app.main` registers the operational router and all eight incoming crisis routers under `/api/crisis`. Every crisis endpoint requires the existing `port_authority` role. Use the same bearer token as the operational API. `GET /api/crisis/health` checks SQL connectivity; `/api/health` retains the operational storage check.

The crisis API provides dashboard, ports, warehouses, routes, shipments, fleet, simulations and scenarios, including what-if comparisons. Exact request contracts are in `/docs`. The intelligence modules supply disruption propagation, route/fleet optimization, cold-chain and priority risk, recovery strategies and explanations. `POST /api/simulation/run` remains available for the original operational estimate.

A separate SQLAlchemy database defaults to `backend/data/crisis.db`; `CRISIS_DATABASE_URL` can override it. Startup creates tables and seeds a synthetic network only when empty. MongoDB operational storage and ownership mappings are unchanged. Crisis records are not automatically synchronized with operational cargo, and running a crisis does not approve or mutate operational routes. Keep the SQL store persistent to retain simulation history. SQLite and local JSON files are ignored by Git; existing local files are preserved.

`LLM_PROVIDER=none` uses deterministic explanations with no external service. Optional `openai` or `watsonx` settings are defined in `app/core/config.py`; keep credentials server-side. Optional model files are not required for the deterministic simulation. Tests isolate both stores and verify crisis authorization plus operational storage isolation.

Road route options may now include validated latitude/longitude geometry, distance, duration and source. The existing logistics approval operation persists these optional fields, allowing the incoming driver map to restore the approved route after reload. Older options without geometry remain valid.
# Operational intelligence

See [OPERATIONAL_INTELLIGENCE.md](OPERATIONAL_INTELLIGENCE.md) for the implemented MongoDB-to-Google-to-Gemini pipeline, setup, role-owned inputs, approvals, real verification results and limitations.

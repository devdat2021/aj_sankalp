# CoastWatch operational intelligence

## Implemented path

MongoDB operational records → dependency/constraint evidence → real Google Route Optimization
→ calculated schedule comparison → schema- and reference-validated Gemini review → persisted
recommendations → scoped logistics decision → atomic operational update, audit and notifications.

The existing portals contain an operational intelligence panel. Port and logistics operators can
select a consignment, supply their role-owned shipment inputs, and logistics can also update
company-scoped fleet availability, capacity and planning inputs. Operators can request analysis,
inspect evidence and review decisions. Captains see scoped recommendations; drivers see approved
instructions in their Alerts panel. No dashboard GET invokes a paid API.

Executable actions are **schedule_transport** and **hold_dispatch**. A hold is a calculated
not-before instruction, never clearance to depart. Schedule approval preserves cargo lifecycle,
port readiness and access approvals. Changing trucks revokes the previous truck's access approval.
Physical pickup enforces approved holds and revised pickup times. Port handling, capacity changes,
and unsafe/unknown road routes remain advisory and use the existing port and OSRM reroute workflows.

## Codebase audit and reuse

| Existing area | Finding and treatment |
| --- | --- |
| `app/api/workflow.py`, `services/workflow.py` | Reused authentication scope, shipment visibility, audit, notifications, route supersession and incident geometry checks. Added event triggers and pickup timing enforcement. |
| MongoDB connection | Existing version increment followed by separate collection replacements was not atomic. Writes now use a MongoDB session transaction, including approval history and notifications. Concurrent conflicts return 409. |
| `intelligence/simulation/engine.py` | Explicit heuristic what-if estimates; remains simulated and excluded from operational analysis. |
| `simulation/crisis_engine.py`, `risk_scorer.py`, `predict.py` | Synthetic SQL assumptions, heuristic fallback predictions and normalized risk scores are not measurements. None enters operational evidence or baseline savings. No fabricated-label training introduced. |
| `simulation/fleet_optimizer.py`, `route_optimizer.py` | Tied to SQL fleet/routes and approximate node coordinates; not copied into the MongoDB planner. Operational fleet constraints use actual IDs and explicit inputs. |
| `services/crisis_explainer.py` | Synthetic explanation/templates retained only for the crisis simulator. Gemini operational review is separate from that synthetic context. |
| Open-Meteo | Existing land/marine forecast service and cache reused; forecast maxima and freshness are evidence, not confirmed incidents or calibrated risk probabilities. |
| OSRM | Existing driver alternatives, geometry and logistics approval retained. Google route geometry is screened using existing incident buffers; unsafe plans are advisory. No new routing/weather provider added. |
| Legacy records | Time-of-day ETA, cargo quantity without a declared weight unit, unspecified fleet capacity/availability and missing deadlines cannot safely supply optimization inputs. They remain explicit missing inputs. |

## Configuration and startup

Install dependencies from the repository root:

```powershell
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

In another terminal:

```powershell
cd D:/Aj1/frontend
npm install
npm run dev
```

Existing `backend/.env` is read by Pydantic and was not overwritten. Configuration names:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | Existing operational database. Atlas or a replica set is required for atomic writes. No SQL operational store is introduced. |
| `INTELLIGENCE_ENABLED` | Enables manual enqueueing and the bounded background worker. Default false. |
| `OPTIMIZATION_ENABLED` | Enables actual Google optimization. Default false. |
| `GOOGLE_CLOUD_PROJECT` | Project ID with Route Optimization API enabled and billing attached. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional server-side credential file path. Empty uses ADC discovery. |
| `GEMINI_API_KEY` | Server-only Gemini Developer API key. |
| `GEMINI_MODEL` | Requested generation model. |
| `GEMINI_RETIRED_MODEL_FALLBACK` | Default `gemini-3.7-flash`; used only after an explicit retired-model 404, not billing/authentication errors or 503. Empty disables this compatibility behavior. Configured and effective models are exposed in analysis status. |
| `INTELLIGENCE_TIMEOUT_SECONDS` | Google HTTP timeout, default 45 seconds; solve budget 20 seconds and ADC transport timeout 15 seconds. |
| `GEMINI_TIMEOUT_SECONDS` | Gemini HTTP timeout, default 90 seconds. |
| `INTELLIGENCE_CACHE_SECONDS` | Identical-snapshot cache and recommendation lifetime, default 900 seconds. |

Enable `routeoptimization.googleapis.com` in the project. ADC requires the
`https://www.googleapis.com/auth/cloud-platform` scope, the
`routeoptimization.locations.use` permission (for example the Route Optimization Editor role),
and permission to consume the billed project. For local development use
`gcloud auth application-default login` and, where needed,
`gcloud auth application-default set-quota-project YOUR_PROJECT_ID`.
Use a workload identity/service account in deployment; do not ship credential JSON or API keys
to the frontend. API usage is billed by the providers; configure project quotas and budget alerts.

API contracts follow Google's [optimizeTours REST documentation](https://developers.google.com/maps/documentation/route-optimization/reference/rest/v1/projects/optimizeTours)
and [Gemini structured output documentation](https://aistudio.google.com/docs/structured-output).
Google timestamps are rounded inward to whole seconds because its solver rejects fractional seconds.
Weight demands round up and vehicle capacities round down to whole kilograms.

## API additions

All routes require the existing bearer authentication.

| Method/path | Owner / behavior |
| --- | --- |
| GET `/api/intelligence/health` | Configuration availability; no paid probe, secrets or implied success. |
| POST `/api/intelligence/analyses` | Port/logistics; `{ "shipment_id": "SHP-101", "retry": false }`; returns persisted job, HTTP 202. |
| GET `/api/intelligence/analyses` | Port- or company-scoped latest 30 analyses, evidence, comparison and integration outcomes. |
| GET `/api/intelligence/recommendations` | Scoped latest 50 recommendations; drivers receive executed instructions only. |
| POST `/api/intelligence/recommendations/{id}/decision` | Decision owner; `{ "status": "approved" or "rejected", "reason": "..." }`. Revalidates state, scope, resources and freshness; duplicate/stale approvals return 409. |
| PATCH `/api/intelligence/shipments/{id}/inputs` | Port owns readiness, pickup windows and pickup service duration. Logistics owns explicit weight, pickup/delivery coordinates, deadline, delivery service duration and baseline schedule. |
| PATCH `/api/intelligence/vehicles/{id}/inputs` | Logistics owns availability, dated shift, capacity, refrigeration, start coordinates, cost rates and currency. |

The existing captain ETA endpoint now records an absolute expected arrival and observation time.
Incident, vessel ETA, port capacity and fleet/input updates enqueue work. A minute-level deadline
scan also detects near/past deadlines. Queue size is 20; the worker executes one job at a time.
Queued superseded snapshots are discarded before external calls. A retry is explicit and subject
to a one-minute minimum interval; valid recent Google results can be reused without another solve.
Unchanged analysis is reused for the cache period. Interrupted jobs are marked failed after five
minutes and are not blindly retried, since the upstream request may have been billed.

## Operational fields

Shipments: `weight_kg`, `pickup`/`delivery` (`lat`, `lng`), `cargo_ready_at`,
`pickup_window_start`, `pickup_window_end`, `delivery_deadline`,
`pickup_service_seconds`, `delivery_service_seconds`, `planned_dispatch_at`,
`planned_pickup_at`, `planned_delivery_at`, `dispatch_not_before`.

Vehicles: `available`, `capacity_kg`, `refrigerated`, `available_from`, `available_until`,
`start` (`lat`, `lng`), `cost_per_hour`, `cost_per_km`, `cost_currency`.
All dates must carry a timezone. Vehicle input updates require the full validated field set;
shipment inputs allow partial role-owned updates. These are additive, backward-compatible fields.

Operational result/history collections: `intelligence_jobs` and `recommendations` in the same
MongoDB database. Recommendations store current/proposed state, evidence, calculations, freshness,
decision history, action owner and provenance. No external service writes operational records.

## Demonstration and actual verification

These scripts intentionally use real configured services, never mocked responses:

```powershell
cd D:/Aj1/backend
../.venv/Scripts/python.exe -u verify_integrations.py
../.venv/Scripts/python.exe -u verify_operational.py --inspect
# Explicitly modifies only the named demo shipment/fleet/vessel inputs, reports ETA,
# runs real analysis and approves feasible recommendations. Requires demo mode + MongoDB.
../.venv/Scripts/python.exe -u verify_operational.py --demo
# Retry prepared inputs, reusing a still-valid Google result where possible:
../.venv/Scripts/python.exe -u verify_operational.py --analyze-current --approve
```

On 27 November 2026 the real checks established:

* MongoDB transaction read/write succeeded against the configured operational database.
* Google ADC and non-solving request validation passed. The real operational solve passed
  response validation and returned a transportation schedule for SHP-101 / TRK-101.
* The route intersected the existing Mulki flood report. It remained advisory; it was **not**
  approved as a safe route. The proposed delivery comparison is conditional, not realized savings.
* Logistics approved a separate evidence-calculated dispatch hold. Recommendation
  `2c1eff1a-70de-4e21-9ee6-72b1a6348afe` was persisted as executed. MongoDB inspection confirmed
  SHP-101's `dispatch_not_before` and notification recipients for port, logistics, captain and driver.
* Gemini model discovery authenticated successfully. `gemini-3.8-flash` and `gemini-3.7-flash`
  appeared in the generation-capable model listing. Actual generation against both returned HTTP 503
  `UNAVAILABLE`; an attempted `gemini-2.5-flash` request returned 404 `NOT_FOUND`. Listing a model
  does not guarantee generation availability. **No real Gemini analysis has been verified
  successfully.** Production reports degraded analysis and uses no fabricated AI response. The
  application does not retry 503s; the compatibility fallback is limited to explicit retired-model
  404 responses.

To see the retained result in the actual app:

1. Start backend and frontend with the commands above and existing demo mode enabled.
2. Enter Logistics → Overview → Operational intelligence. Inspect the latest analysis and executed
   dispatch hold for SHP-101. The Google proposal is advisory because of the flood.
3. Enter Driver → Alerts. Inspect the approved hold and its explanation. The shipment remains at sea;
   approval did not invent a pickup or delivery milestone.
4. Enter Port → Overview and Captain → Overview / Notifications to see the scoped recommendation
   and notification. The hold time and history remain visible after refresh.
5. For a fresh run, update future cargo readiness/window as Port and baseline transport inputs as
   Logistics, then report a revised ETA from the Captain portal. Review the automatically queued
   analysis or select the shipment and click Analyze disruption. Approve a current pending hold
   as Logistics; another role is denied. Old/expired plans must be reanalyzed.
6. For route schedule execution, use records with confirmed fleet inputs and a route clear of
   reported hazards. Resolve actual incidents through the existing authorized workflow only when
   operational evidence warrants it; the demo script does not falsely clear the flood.

Demo input values are explicitly labelled assumptions on the shipment and are not measured
performance. Do not run `--demo` against business records. It leaves audit/history for review.

## Tests

Verification result: **101 backend tests passed; 14 frontend tests passed; ESLint and production
TypeScript/Vite build passed.** Existing Python deprecation warnings and the Vite large-chunk
warning remain.

```powershell
cd D:/Aj1/backend
../.venv/Scripts/python.exe -m pytest -q
cd ../frontend
node --test tests/*.test.js
npm run lint
npm run build
```

External calls are mocked only in automated unit/integration tests. New tests cover dependency
closure, tenant boundaries, missing/infeasible inputs, request constraints, whole-second timestamps,
response indices/order/windows/capacity/traffic/skips, hallucinated entity and action IDs, numeric
claims, grounded recommendation generation, ownership, duplicate/stale execution, notifications,
automatic triggers, external failure, dispatch holds and road hazard screening.

## Limits and deployment considerations

* A browser walkthrough was not performed because browser access was declined. An isolated,
  non-Mongo demo backend and frontend both passed local HTTP smoke checks; no operational records
  were changed. Frontend validation also used rendered-component tests, ESLint and a production
  build. The live operational scenario used the actual FastAPI handlers, existing demo
  authentication, MongoDB and external transports.
* The full acceptance path including successful real Gemini review is blocked by upstream 503;
  credentials alone are not evidence of generation availability. Retry explicitly after recovery.
* The real Google route was unsafe under the existing report and therefore not executed. Complete
  schedule execution is covered by automated tests; real MongoDB approval/execution is verified
  for the dispatch-hold action.
* Dependencies are expanded transitively within a company and port to prevent cross-scope manifest
  disclosure. Port-wide capacity events enqueue each affected company separately; a unified
  cross-company optimizer is not implemented.
* Port capacity is checked conservatively as current availability. Optimization does not reserve
  berth/yard capacity or model a port handling calendar. Those decisions retain existing ownership.
* Google route geometry is screened for existing hazards but does not receive arbitrary road closure
  polygons. OSRM alternatives still require the established logistics route approval workflow.
* Gemini can select/reason about server-generated candidates, never invent executable mutations.
  Narrative numerical claims are rejected; quantitative impacts come from records/calculations.
* No calibrated ML prediction, spoilage probability or financial savings is claimed. Comparisons
  show measured-input schedule differences only when a baseline exists.
* Snapshot freshness is deliberately conservative: any relevant operational change can invalidate
  other pending recommendations. Multi-route recommendations may require reanalysis after an
  earlier approval. Shipment and fleet planning inputs have role-scoped portal forms; these do not
  replace the existing fleet-management workflows.
* Deployment retains the existing whole-state collection persistence model with atomic MongoDB
  transactions. Use one application worker initially; large histories should eventually use targeted
  collection queries/updates and an explicit retention policy. No broker or microservice is required.
* Existing synthetic crisis modules and simulation assertions remain unchanged and isolated; their
  legacy deprecation warnings and frontend bundle-size warnings are outside this implementation.

Modified/new implementation files: `app/core/config.py`, `database/connection.py`,
`database/collections.py`, `api/workflow.py`, `api/intelligence.py`, `schemas/intelligence.py`,
`intelligence/operational.py`, `services/intelligence_external.py`,
`services/operational_intelligence.py`, `main.py`, `requirements.txt`, `.env.example`,
`tests/test_operational_intelligence.py`, `verify_integrations.py`, `verify_operational.py`;
frontend `components/Intelligence.jsx`, `IntelligenceInputs.jsx`, `Workspace.jsx`,
`portals/port/PortPortal.jsx`, `portals/driver/DriverPortal.jsx`, and
`services/intelligenceErrors.js`.

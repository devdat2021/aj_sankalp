# CoastWatch-SCM — Port authority portal

Local React + FastAPI implementation for the port authority assignment. Existing `C:/AJET/bob-ai-hackathon-y2ms` is left intact. The duplicate port application has been consolidated into the root project.

## Start locally

Backend (PowerShell):
```powershell
cd C:\AJET\CoastalWatch\backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Frontend (second terminal):
```powershell
cd C:\AJET\CoastalWatch\frontend
npm install
npm run dev
```
Open http://127.0.0.1:5173/port and choose **Enter demo workspace**. API documentation: http://127.0.0.1:8001/docs.

## Understanding the backend

The supplied backend.txt is an architectural directory tree, not executable source. This project follows its separation of responsibilities, implementing the port-specific subset:

- `app/main.py` creates FastAPI and configures CORS.
- `app/core/config.py` reads environment settings. `security.py` validates identity and port authority scope.
- `app/api/router.py` defines HTTP contracts and validation boundaries.
- `app/schemas/port.py` validates request bodies and allowed status values.
- `app/services/port_service.py` handles lookup, notifications and audit records.
- `app/database/connection.py` persists state locally or in Atlas with optimistic concurrency.
- `app/database/collections.py` supplies coherent shared demo IDs.
- `app/intelligence/simulation/engine.py` computes deterministic, explicitly labeled impact estimates.

Flow: browser → authenticated endpoint → validated request → state transition → persistence → response → dashboard refresh. The dashboard polls every eight seconds. Decisions atomically update the request, shipment ETA, notification and audit entry. Already-decided requests return 409. Incidents enforce reported → confirmed/rejected → resolved (resolution only from confirmed).

## Implemented screens

Control tower with OSM map, vessel and truck tracking, cargo search, berth/cold-store capacity, incident submission/review, recovery approval/rejection, port-wide alerts and acknowledgment, what-if simulation, audit trail, demo entry and optional Supabase login. Frontend organization follows the image: `src/portals/port/PortPortal.jsx`, `components/`, `services/`, with shared App/main/CSS.

## Atlas and Supabase

Copy `backend/.env.example` to `.env`. Set `MONGODB_URI`, `SUPABASE_URL`, and `DEMO_MODE=false`. Create `frontend/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Use Supabase asymmetric JWT signing (ES256 or RS256). Tokens are verified for signature, expiration, issuer, audience and subject. Insert a trusted user mapping in the aggregate's `state.users` with `auth_user_id` equal to the Supabase account UUID, `role: port`, `port_id: NMP`, and `active: true`. Never accept role assignments from browser metadata.

Atlas currently stores one versioned `port_state` aggregate with `_id: NMP`, `version`, and `state`. This differs from the blueprint's normalized collections: it makes the port MVP's multi-record decisions atomic without requiring transaction setup. Production multi-port support should normalize collections, add geospatial indexes, and retain transactional approvals. Local JSON storage is for one backend process only. Demo mode includes a deliberately public demo credential; keep the server on loopback and disable demo mode before deployment.

## Integration boundaries and limitations

The driver portal is included in the unified frontend as a session-only demo. Captain portals, driver-owned APIs, live weather, OSRM hazard-checked routes, live telemetry, and production deployment are not included. All map positions and options are seeded; road and maritime alternatives are not verified safe routes. Alerts currently target the port workspace, not individual field users. Connect teammates' assignment-scoped dashboards and notification recipients before claiming the full three-portal workflow. The backend currently authorizes one port (NMP).

Existing ChainMind simulation and optimization modules were inspected. Their deterministic impact and transparent scoring ideas inform this implementation; their SQLAlchemy models and code were not copied or integrated. No trained ML prediction is claimed. Capacity is a seeded operational snapshot; simulation does not change it.

## Checks
```powershell
cd C:\AJET\CoastalWatch\backend
python -m pytest -q
cd ..\frontend
npm run build
```
Tests exercise authentication failure, approval persistence and duplicate protection, invalid option rollback, incident lifecycle, read-only simulations and idempotent acknowledgment.

# CoastWatch — unified application

One React/Vite frontend (`frontend/`) and one FastAPI backend (`backend/`). The incoming port authority dashboard, Fleet Cockpit and crisis simulation interfaces share the local authentication and four-role operational workflows. Logistics and captain workspaces retain their existing functionality.

## Run locally (PowerShell)

From `D:/Aj1` (create `.venv` with `python -m venv .venv` if absent):

```powershell
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd backend
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload --reload-dir app
```

In another terminal:

```powershell
cd D:/Aj1/frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173; API documentation is at http://127.0.0.1:8001/docs. Copy environment examples only if the corresponding configuration file does not already exist. Preserve existing credentials. Vite proxies `/api` to port 8001. Choose a demo role on the home page and sign out to switch roles. Demo entry requires backend `DEMO_MODE=true` and no frontend Supabase configuration.

## Storage and authentication

See [Supabase and administrator setup](SUPABASE_SETUP.md) for credentials, initial admin provisioning, role management, and hosted Auth settings.

- Operational consignments, capacity, requests, incidents and notifications retain the existing MongoDB Atlas integration (`MONGODB_URI`, `MONGODB_DB`). An empty URI uses local JSON in demo mode. Demo actions use the configured database; they are not automatically isolated.
- Crisis simulations use a separate SQLAlchemy store, defaulting to `backend/data/crisis.db`. Startup creates its tables and seeds a synthetic logistics network if empty. Optional `CRISIS_DATABASE_URL` overrides this store. Simulation scenarios and history persist here; simulation does not change operational assignments or capacity in MongoDB.
- Supabase remains the shared authentication provider when configured. Roles and asset/company permissions are resolved by FastAPI, not the browser. See [backend setup](backend/README.md) and [frontend setup](frontend/README.md). Live Supabase login must be verified once credentials/accounts are configured.
- `.env` files, runtime JSON/SQLite data and Python caches are ignored. Existing runtime data files are retained locally, not versioned.

From `backend/`, `../.venv/Scripts/python.exe -m app.database.check_connection` performs a read-only MongoDB ping and application collection read. It fails when Atlas is unconfigured or unreachable. Set `DEMO_MODE=false` for production and configure trusted user mappings.

## Verify the integration

```powershell
# From backend/
../.venv/Scripts/python.exe -m pytest -q
# From frontend/
node --test tests/api.test.js tests/driverApi.test.js
npm run lint
npm run build
```

1. Enter Port Operations. Review Requests, Cargo, capacity, incidents and Weather. Open Crisis Simulator, run a disruption and check results, History, What-if comparison and Network overview.
2. Enter the truck operator demo. Load road alternatives and submit a reroute request. Sign out and enter logistics to approve it. Return to the driver: the approved route and geometry persist, including after reload. Report an incident and verify it in port operations.
3. Logistics creates/assigns cargo and requests handling/access. Port Operations approves these and docking requests. Captains record vessel movements; logistics receives linked cargo notifications. Existing pickup/delivery and warning acknowledgment remain available.

Crisis estimates and road hazard overlays use synthetic data. Road previews use OSRM with a labeled demonstration fallback and require logistics approval. Positions are seeded or manually reported; maps/weather need internet. SOS creates an internal incident, not an emergency call. Optional LLM explanations are disabled by default (`LLM_PROVIDER=none`); deterministic explanations work without external keys or ML model files.

## Integration verification

The combined suite passes 44 backend tests and 7 frontend tests; lint, TypeScript checking and Vite build pass. A browser smoke test verified crisis execution/history and the shared port Requests view. Atlas ping/read passed separately. Tests use temporary storage. Non-blocking warnings remain for upstream Python deprecations and the large lazy-loaded crisis dashboard bundle.

# CoastWatch — unified application

One frontend (`frontend/`) and one FastAPI backend (`backend/`).

## Start

Backend, from `C:/AJET/CoastalWatch/backend`:
```powershell
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```
Frontend, in another terminal from `C:/AJET/CoastalWatch/frontend`:
```powershell
npm ci
npm run dev
```
Open http://127.0.0.1:5173. Choose Driver or Port Authority. Port Authority has an **Enter demo workspace** button. `/api` proxies to the backend on port 8001.

## MongoDB

Use the Atlas `coastwatch-cluster` in the `CoastWatch-SCM` project. Set `MONGODB_URI` to its authenticated connection URI in `backend/.env`, with `MONGODB_DB=coastwatch`, and allow the backend machine's IP in Atlas network access. Use an application database user with `readWrite` access to `coastwatch`. Credentials must remain outside source control; `backend/.env` is ignored by Git and is loaded independently of the working directory.

From `backend/`, run `python -m app.database.check_connection` to verify a real MongoDB ping and application collection read without modifying data. The check exits unsuccessfully when MongoDB is unconfigured or unreachable. `/api/health` also checks application storage access, initializing demo state if the database is empty. An empty URI still uses local JSON in demo mode and does not establish an Atlas connection.

Demo mode uses local JSON when the URI is empty. Before production, disable `DEMO_MODE` and configure Supabase authentication and trusted user mappings (see `backend/README.md`). Optional frontend environment variables are in `frontend/.env.example`.

## Branch consolidation

Fetched all branches on 2026-11-27. Madhuresh and mk both point to `7e13d15`; main at `45bb8d4` includes them; feature/port-authority-portal at `c3eae11` includes main. All are ancestors of the local `consolidate/unified-app` branch. Both portals now use one frontend build, with scoped port styles and navigation. The backend has moved to the root.

Duplicate port folders were moved to `C:/Users/Alfaz/CoastalWatch-backup-20261127` for recovery. The sibling port source matched the repository copy. `C:/AJET/bob-ai-hackathon-y2ms` was not modified.

## Feature boundaries

Port Authority persists cargo, incidents, decisions, alerts and simulations through FastAPI. Driver remains the original session-only demo: its incidents and simulated approvals do not synchronize with Port Authority. Maps require internet. Telemetry is simulated; no emergency service is contacted.

## Checks

Run `python -m pytest -q` in backend, and `npm run build` and `npm run lint` in frontend.

## Crisis Simulator

Open Port Authority → Enter demo workspace → Crisis Simulator. The full simulator from `bob-ai-hackathon-y2ms` is integrated: disruption scenarios, cascading impact, risk and cold-chain scoring, fleet and route optimization, recovery strategies, what-if comparison, and saved history. The source project is unchanged.

The same FastAPI server exposes authenticated `/api/crisis` endpoints. Startup seeds the synthetic network once in `backend/data/crisis.db` (SQLite, ignored by Git); existing history is preserved. This simulator uses its own synthetic network, not live Port Authority shipment records. Port operations continue using MongoDB or local JSON. Optional LLM explanations default to templates; no trained ML model is bundled.

Backend modules use the existing `app/api`, `app/database`, `app/schemas`, `app/services`, and `app/intelligence/simulation` folders. UI modules use the existing `src/portals/port`, `components`, and `services` folders. No second app or project folder is required. Run `npm ci` in frontend and install backend requirements after updating.

# CoastWatch — unified application

Backend workflow updated to four roles: Port Operations, logistics company, driver, and captain. See [backend contracts and setup](backend/README.md). Logistics now owns road reroute approvals; ports own handling, access, and docking. All four frontend role workspaces now use these APIs. See [frontend setup](frontend/README.md) for Supabase configuration.


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
Open http://127.0.0.1:5173. Choose Logistics, Port Operations, Truck Operator or Vessel Operator on the home page. Local demo access is available until Supabase is configured. `/api` proxies to the backend on port 8001.

## MongoDB

Use the Atlas `coastwatch-cluster` in the `CoastWatch-SCM` project. Set `MONGODB_URI` to its authenticated connection URI in `backend/.env`, with `MONGODB_DB=coastwatch`, and allow the backend machine's IP in Atlas network access. Use an application database user with `readWrite` access to `coastwatch`. Credentials must remain outside source control; `backend/.env` is ignored by Git and is loaded independently of the working directory.

From `backend/`, run `python -m app.database.check_connection` to verify a real MongoDB ping and application collection read without modifying data. The check exits unsuccessfully when MongoDB is unconfigured or unreachable. `/api/health` also checks application storage access, initializing demo state if the database is empty. An empty URI still uses local JSON in demo mode and does not establish an Atlas connection.

Demo mode uses local JSON when the URI is empty. Before production, disable `DEMO_MODE` and configure Supabase authentication and trusted user mappings (see `backend/README.md`). Optional frontend environment variables are in `frontend/.env.example`.

## Branch consolidation

Fetched all branches on 2026-11-27. Madhuresh and mk both point to `7e13d15`; main at `45bb8d4` includes them; feature/port-authority-portal at `c3eae11` includes main. All are ancestors of the local `consolidate/unified-app` branch. Both portals now use one frontend build, with scoped port styles and navigation. The backend has moved to the root.

Duplicate port folders were moved to `C:/Users/Alfaz/CoastalWatch-backup-20261127` for recovery. The sibling port source matched the repository copy. `C:/AJET/bob-ai-hackathon-y2ms` was not modified.

## Feature boundaries

All four portals share cargo, incidents, decisions and scoped alerts through FastAPI. Logistics approves road changes; ports approve access and docking. Maps and weather require internet. Positions are seeded or manually reported; no emergency service is contacted.

## Checks

Run `python -m pytest -q` in backend, and `npm run build` and `npm run lint` in frontend.

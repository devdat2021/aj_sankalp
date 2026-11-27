# Logistics data contract — Phase 1

This document describes the current operational API and separates implemented fields from proposals for later phases. It does not change the synthetic crisis SQL dataset or add schema migrations.

## Phase 5 — reroute review and decisions (implemented)

Confirmed decisions: a truck or approved-route change makes pending proposals outdated and requires a fresh proposal. The bounded Phase 3 eligibility defects were also approved for repair. No rescheduling, new dispatch action or clearance state was introduced.

- Existing `POST /api/route-requests` and `PATCH /api/route-requests/{id}` remain the submission/decision APIs. Only the owning logistics company can approve/reject. A consignment may have one current pending proposal; drivers and ports cannot approve.
- New proposals snapshot `truck_id`, `assignment_version`, `base_route_id`, `base_route` and `base_eta_hours` from the server. These cannot be supplied by the client. Assignment edits increment the version and supersede pending proposals. Decision validation also compares the snapshot with the live assignment to catch inconsistent/out-of-band edits.
- `superseded` means no longer actionable, with `superseded_reason` and, for recorded invalidations, `superseded_at`. The original request remains in history. A fresh proposal is permitted. Delivered cargo cannot receive further route changes; pending requests are superseded on delivery.
- Legacy requests without baseline snapshots remain reviewable against current cargo. The UI explicitly labels the missing baseline. Any assignment change made through the updated API supersedes them as well; changes before the snapshot feature cannot be reconstructed.
- Submission never changes the active route or ETA. Approval installs only the selected stored option, preserving its optional geometry/source, and adds that option's nonnegative `delay_hours` to the current relative `eta_hours` once. Rejection changes neither. Invalid, duplicate, unauthorized or stale decisions leave operational state unchanged.
- `reason` remains the original proposal reason. `decision_reason`, `reviewer`, `reviewed_at`, `option_id`, `previous_route`, `eta_before_hours` and `eta_after_hours` describe the decision separately. Old decisions that overwrote proposal reasons cannot be reconstructed; displays/history fall back to their existing reason.
- The Requests view compares current instructions, proposal baseline, delay, cost/risk estimates and the projected relative ETA. Approval requires an explicit option; rejection needs no option. Decision controls are absent for decided/superseded requests. Estimates are not verified navigation and do not change delivery or pickup slots.
- Existing notifications reach the relevant operators, and the driver dashboard refresh retrieves the approved route/geometry or rejection reason. Driver views show superseded reasons so an outdated request does not leave them indefinitely waiting.
- History represents submission as `route_pending` at `created_at`, decision as `route_approved`/`route_rejected` at `reviewed_at`, and recorded invalidation as `route_superseded`. These have stable distinct IDs and retain the proposal and decision reasons separately. Dashboard histories are derived on read; reading a shipment no longer stores its derived history back into operational data.

### Bounded integration repairs

Pickup eligibility now recognizes unloading as complete once status advances to `ready_for_pickup`, `in_transit` or `delivered`; it does not require two mutually exclusive current statuses. Actual pickup eligibility remains `ready_for_pickup` plus a matching approved truck-access request and assigned truck. The eligibility endpoint imports the existing helper correctly. Dashboard responses include the same derived eligibility for the cargo view; port users can inspect matching access without needing a company identity. Existing pickup mutation checks remain unchanged.

The cargo view's malformed access expressions and undefined driver-label variable were repaired. It consumes backend eligibility instead of repeating the contradictory frontend rule. No new no-sea-leg receipt workflow or fleet validation rules were added.

### Local verification

Use demo mode with disposable local operational storage (an Atlas-configured demo writes to Atlas). In the driver portal, submit a road alternative; in logistics Requests, compare and reject it, verifying the route/ETA stays unchanged. Submit a fresh proposal and approve a specific option; return to the driver and refresh to verify its active geometry and decision notification. Submit another proposal, then change the pre-pickup assignment/initial route in logistics: the earlier proposal must show superseded with no decision controls and a fresh proposal must be allowed. A delivered consignment must reject new route requests.

Automated checks: `../.venv/Scripts/python.exe -m pytest -q` from backend; `node --test tests/api.test.js tests/driverApi.test.js tests/logisticsViews.test.js`, `npm run lint` and `npm run build` from frontend. Tests use temporary storage. Live Supabase login and external routing-provider availability are not covered by these checks.

## Ownership and access

- The backend verifies the bearer token and resolves its subject to an active `users` record. The trusted record supplies `role`, `company_id`, `port_id` and `asset_id`. JWT role/company claims and client request fields do not grant access.
- Required scopes: logistics needs `company_id`; driver needs `company_id` and `asset_id`; captain needs `asset_id`; port needs `port_id`. Missing, empty or unsupported mappings return 403.
- Logistics can read and act on consignments only when their `company_id` matches the user's company. Missing and unauthorized direct consignment lookups return the same 404 response. Creation sets company ownership on the server; `company_id` is not a permitted input field.
- Incidents, reroutes and port requests inherit scope through `shipment_id`. Direct mutations check the linked consignment before changing state. Request IDs are not authorization.
- Logistics dashboards expose only company trucks, even if an inconsistent legacy consignment references a foreign truck. Assignments reject foreign trucks. Existing inconsistent data is not silently rewritten.
- Shared vessels are visible only when linked to an owned consignment. The logistics response contains an allowlisted tracking summary, never the vessel's complete manifest or vessel-level event history. A captain retains visibility over cargo on their assigned vessel; the port retains its port-scoped operational view.
- Logistics cannot record vehicle positions, vessel/cargo milestones, port approvals or docking decisions. Its dashboard carries no port audit trail or docking request list.
- A shared alert remains a single stored event with independent acknowledgments. Logistics responses expose only the signed-in user's `recipient_ids` and `read_by`, including the acknowledgment response itself. Port review remains unchanged. Alert delivery remains recipient-based; acknowledgment never removes another recipient's acknowledgment.
- Warning text is shared with its selected audience. Authors must not put private consignment details into a warning addressed to multiple companies. This phase does not attempt to redact arbitrary operator-written text.

## Existing fields and relationships

| Record / field | Current meaning and source | Gap or limit |
| --- | --- | --- |
| Consignment `id` | Server-generated UUID; legacy seeds use `SHP-*` IDs | No editable business reference such as `CW-104` |
| `company_id` | Owning company, set from trusted logistics identity | No company-transfer API |
| `cargo`, `quantity` | Cargo description and quantity in tonnes | No itemized manifest per consignment |
| `origin`, `destination` | Operator-entered source/destination labels | Not normalized port IDs or geographic coordinates |
| `port_id` | Handling/access port, currently the configured `NMP` | Not both ends of a voyage; multi-port scheduling is absent |
| `vessel_id` | Optional reference to an existing vessel | No voyage identity or booking verification; does not grant access to other cargo on that vessel |
| `truck_id` | Assigned company vehicle; null until assigned for new cargo | No assignment history or availability scheduling |
| Vehicle `driver_id` | Driver attached to the vehicle | No separate per-consignment driver assignment |
| `route_id`, `route` | Initial logistics instructions or approved reroute option | No separate immutable route-version history |
| Route option fields | `id`, `name`, `delay_hours`, `cost`, `risk`, `simulated`; optional `points` (lat/lng pairs), `distance` (metres), `duration` (seconds), `source` | Estimates, not verified navigation; old records may omit optional fields |
| `eta_hours` | Current relative cargo ETA; updated by vessel events or reroute delay | No absolute ETA baseline or separate sea/road ETA |
| `requires_cold`, `temperature`, `max_temperature` | Cargo refrigeration requirement and reported temperature/limit | No live sensor feed |
| `status` | Current cargo lifecycle state | No separate customs/clearance record |
| `events[]` | Consignment movement events with ID, event and server `created_at`; vessel events include `vessel_id`, `eta_hours`; cargo events include `actor` | Creation, assignment and request decisions are not combined into this timeline |
| Route request | `shipment_id`, reason, options, status; new records include requester/time and decisions include reviewer/time | Legacy seeded records can omit metadata |
| Port request | `shipment_id`, `kind` (`handling`/`truck_access`), `requested_at`; access request snapshots `truck_id`; decision has slot/reason/reviewer | No alternative-slot proposal state |
| Vessel tracking summary | `id`, `name`, `status`, `movement_status`, `source`, `destination_port_id`, `eta`, `eta_hours`, `lat`, `lng`, `last_seen`, `simulated`, when present | `eta` is a legacy display value; no voyage-specific tracking/history contract |
| Alert | ID, text, severity, creation time, recipients and independent read state | Recipient membership is recorded at publication; no automatic replay to newly added company users |

## Existing event names and decision owners

Keep these names unchanged in Phase 1:

| Event / action | Current owner | Result |
| --- | --- | --- |
| `consignment_created` | Logistics | Audit entry; new consignment is `planned` |
| `truck_assigned` | Logistics | Assignment and audit entry; not a movement event |
| `departed` | Captain | Linked inbound cargo becomes `at_sea`; explicit event sends cargo notices |
| `arrived` | Captain | Linked cargo becomes `arrived`; does not imply unloading |
| `docked` | Captain, after port docking approval | Linked cargo becomes `at_port` |
| `unloaded` | Port | `at_port` → `unloaded` |
| `ready_for_pickup` | Port | `unloaded` → `ready_for_pickup` |
| `picked_up` | Assigned driver, with matching approved truck access | `ready_for_pickup` → `in_transit` |
| `delivered` | Assigned driver | `in_transit` → `delivered` |
| Reroute `approved` / `rejected` | Logistics | Request decision; approval updates the route and relative ETA |
| Handling/access/docking `approved` / `rejected` | Port | Request decision, not an actual movement |

Event timestamps are UTC ISO strings. `created_at` currently means when the server recorded the event, not an independently supplied occurrence time. Requested/approved slots require timezone-aware timestamps.

## Frontend contract review

`Workspace.jsx` obtains `/api/logistics/dashboard` with the shared bearer token. Cargo, Requests, Operations/Tracking, notifications and the map consume its scoped arrays. Creation sends no company identity; the company-truck selector consumes `data.vehicles`. There is no client-side fetch of an unfiltered manifest. The backend projections preserve every field these components consume, so no UI changes are needed in Phase 1.

## Phase 2 — unified consignment history (implemented)

**Objective:** A logistics user opening one owned consignment should see its complete linked journey:
  Consignment → vessel/voyage → handling port → assigned truck/driver → destination,
  with a chronological history of recorded actions and movements, without exposing another company's cargo.

**Unified event representation:** Events from multiple sources are normalized into a consistent format:
  `{ id, event, created_at, actor?, details? }`
  where `event` is one of: `consignment_created`, `truck_assigned`, `port_handling_approved`,
  `port_truck_access_approved`, `route_approved`, `route_rejected`, `departed`, `arrived`,
  `docked`, `unloaded`, `ready_for_pickup`, `picked_up`, `delivered`.
  Timestamps are the server `created_at` when the event was recorded; original occurrence
  times are preserved where supported (vessel event `eta_hours`, cargo event `eta_hours`).

**History source collection:**
  1. Shipment‑owned events (`sh['events']`) — vessel events (departed/arrived/docked) and
     cargo events (unloaded/ready_for_pickup/picked_up/delivered), already appended by the
   respective vessel/cargo event endpoints.
  2. Port requests related to the shipment — creation (`port_handling_pending`,
  `port_truck_access_pending`) and approval decisions (`port_handling_approved`,
  `port_truck_access_approved`) with slot/reason details.
  3. Route requests related to the shipment — creation (`route_pending`) and decisions
   (`route_approved`, `route_rejected`) with option details.

**Predictable sorting & deduplication:** All events are sorted by `created_at` (earliest first);
  duplicate events (same `id`) are removed. Missing/empty timestamps sort last.

**Never invent history for legacy records:** Consignments without recorded events display
  “No movement events recorded.”  Original event IDs and timestamps are preserved when
  available; no artificial actions or dates are introduced.

**Approval ≠ movement:** Port approvals and route decisions are recorded as distinct event
  types (`port_handling_approved`, `route_approved`) and are never reinterpreted as actual
  cargo movements.

**Company isolation:** The `visible()` check server‑controls access.  A logistics user sees
  history only for consignments where `company_id` matches.  Shared-vessel events never
  reveal another company’s consignment IDs or cargo.

- **Phase 2 / Person 3:** agree on `consignment_reference`, `voyage_id`, normalized
  `source_port_id` / `destination_port_id`, voyage membership and the rules for linking
  cargo to a voyage. Decide how a company proves a booking before using linkage to obtain
  vessel tracking. Do not use a vessel ID as a substitute for voyage identity.
- **Phase 2 / all:** agree on a unified timeline envelope (recorded time vs occurrence time,
  actor, consignment, related request/assignment and event type). Preserve existing movement
  names; do not reinterpret approval as movement.
- **Phase 3 / Person 1:** define what clearance means and whether `ready_for_pickup`
  certifies it or a separate clearance state is required. Agree on dispatch vs advance
  assignment rules. Existing arrival/unload/readiness transitions remain untouched.
- **Phase 4 / Person 3:** agree on driver assignment ownership, truck capacity/availability
  and reassignment history before adding constraints or new fields.
- **Phase 6 / Persons 1 and 3:** agree on separate absolute sea/road ETAs, delivery windows,
  ETA change source/time, rescheduling flags and alternative pickup-slot request states. A
  proposed slot must not overwrite an existing approval before the port decides.

These are coordination questions for later phases, not new API fields or promised functionality.

## Verification

From `backend/` run `../.venv/Scripts/python.exe -m pytest -q`. `test_logistics_scope.py`
uses temporary JSON storage, two companies on one vessel and a locally signed JWT with a
mocked JWKS source. It checks scoped lists/details, nested vessel data, foreign writes
without mutation, trusted mapping precedence, assignment ownership, private acknowledgments
and preserved port/captain/driver access. It does not validate a live Supabase account or
modify Atlas. Existing crisis tests separately verify that logistics cannot access the
port-only synthetic simulation API.

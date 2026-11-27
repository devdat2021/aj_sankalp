# Logistics data contract — Phase 1

This document describes the current operational API and separates implemented fields from proposals for later phases. It does not change the synthetic crisis SQL dataset or add schema migrations.

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

## Proposed future contract — not implemented

- **Phase 2 / Person 3:** agree on `consignment_reference`, `voyage_id`, normalized `source_port_id` / `destination_port_id`, voyage membership and the rules for linking cargo to a voyage. Decide how a company proves a booking before using linkage to obtain vessel tracking. Do not use a vessel ID as a substitute for voyage identity.
- **Phase 2 / all:** agree on a unified timeline envelope (recorded time vs occurrence time, actor, consignment, related request/assignment and event type). Preserve existing movement names; do not reinterpret approval as movement.
- **Phase 3 / Person 1:** define what clearance means and whether `ready_for_pickup` certifies it or a separate clearance state is required. Agree on dispatch vs advance assignment rules. Existing arrival/unload/readiness transitions remain untouched.
- **Phase 4 / Person 3:** agree on driver assignment ownership, truck capacity/availability and reassignment history before adding constraints or new fields.
- **Phase 6 / Persons 1 and 3:** agree on separate absolute sea/road ETAs, delivery windows, ETA change source/time, rescheduling flags and alternative pickup-slot request states. A proposed slot must not overwrite an existing approval before the port decides.

These are coordination questions for later phases, not new API fields or promised functionality.

## Verification

From `backend/` run `../.venv/Scripts/python.exe -m pytest -q`. `test_logistics_scope.py` uses temporary JSON storage, two companies on one vessel and a locally signed JWT with a mocked JWKS source. It checks scoped lists/details, nested vessel data, foreign writes without mutation, trusted mapping precedence, assignment ownership, private acknowledgments and preserved port/captain/driver access. It does not validate a live Supabase account or modify Atlas. Existing crisis tests separately verify that logistics cannot access the port-only synthetic simulation API.

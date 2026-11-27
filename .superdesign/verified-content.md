# Verified product content
4 Connected Stakeholders: port authorities, logistics companies, truck drivers, ship captains. Defined by services/roles.js and backend role-scoped dashboards.
3 Transport Stages: maritime transportation, port operations, road logistics. Milestones departed/arrived/docked/unloaded/ready_for_pickup/picked_up/delivered are in workflow.py.
1 Unified Platform: shipment tracking (seeded/manual positions), incident reporting, approvals, disruption management. Do not claim live AIS/GPS.
Predictive Disruption Analysis: modeled cascading impacts across shipments/routes/resources; deterministic simulator, not validated real-world forecasting.
Intelligent Recovery Planning: compare modeled strategies by estimated costs, delays and cargo risks; recommendations require operator review.
Cold-Chain Risk Assessment: flags temperature-sensitive cargo for intervention.
## Actual saved simulator example (synthetic data, no invented figures)
Chennai port closure, 72h, high severity. Completed 27 Nov 2026. Selected comparison strategy Balanced (NOT the engine recommendation, which is fastest).
Four cards:
- ₹23.61 lakh: estimated recovery cost saved compared with the speed-optimized strategy. Exact difference ₹2,361,147.20 (₹8,395,190.02 minus ₹6,034,042.82).
- 49.08 h: estimated average disruption delay avoided per affected shipment. Disrupted baseline245.44h minus balanced196.36h.
- 27: affected shipments identified.
- 20.0%: reduction in projected delay impact. Formula49.08/245.44*100. This is delay reduction, NOT an overall impact score or validated performance rate.
Tradeoff must be visible: Balanced takes61.36h longer than speed-optimized recovery; cost and delay cards have different explicitly named baselines. 8 cold-chain shipments at risk optional.
Clearly label whole section SIMULATION-BASED ESTIMATES; saved synthetic scenario, not live operations or real-world savings. Include expandable methodology and source run ID bd056193-496f-43f1-8d20-9efdfec04a85. No private shipment records or secret API tokens belong on public page.

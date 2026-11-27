import { Anchor, Package, Truck, Ship, ShieldCheck } from 'lucide-react'
export const roles = {
  admin: { name: 'Administrator', description: 'Manage accounts, roles and operational access.', icon: ShieldCheck },
  logistics: { name: 'Logistics company', description: 'Plan consignments, assign trucks and coordinate transport.', icon: Package },
  port: { name: 'Port Operations', description: 'Manage access, docking, capacity and disruption warnings.', icon: Anchor },
  driver: { name: 'Truck operator', description: 'Follow assignments, report conditions and update deliveries.', icon: Truck },
  captain: { name: 'Vessel operator', description: 'Coordinate docking, cargo and vessel movements.', icon: Ship },
}

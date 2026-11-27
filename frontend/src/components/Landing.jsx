import { ArrowUpRight, Anchor, Ship, Truck, Route, Users, Network, GitBranch, ShieldCheck, MapPinned, Thermometer } from 'lucide-react'
import { roles } from '../services/roles'
import '../landing.css'

const stages = [
  [Ship, 'Maritime transportation', 'Vessel movements & cargo visibility'],
  [Anchor, 'Port operations', 'Capacity, access & handling approvals'],
  [Truck, 'Road logistics', 'Assignments, routes & delivery updates'],
]
const capabilities = [
  [MapPinned, 'Know where things stand', 'Shipment and route visibility', 'See consignments, truck positions, destinations and route status from the same operational view.'],
  [GitBranch, 'Make decisions with context', 'Rerouting approvals', 'Review a driver’s proposed route alongside the approved route, reported restrictions and ETA impact.'],
  [Thermometer, 'Protect what is moving', 'Cargo and cold-chain checks', 'Track cargo readiness, temperature readings and the conditions that can block pickup or delivery.'],
]

export default function Landing({ children, enter, busy, demoEnabled, hasSignIn }) {
  return <main className="cw-landing" id="top"><div className="landing-wrap">
    <section className="landing-hero landing-noise" aria-labelledby="landing-title">
      <svg className="landing-contours" viewBox="0 0 1500 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="landing-ocean" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#34d399" stopOpacity=".05"/><stop offset=".5" stopColor="#047857" stopOpacity=".65"/><stop offset="1" stopColor="#07110e"/></linearGradient></defs><path d="M-200 750 Q200 100 650 430 T1750 150 L1700 950H-200Z" fill="url(#landing-ocean)"/><g fill="none" stroke="#6ee7b7" strokeOpacity=".13">{[0, 25, 50, 75, 100, 125].map(n => <path key={n} transform={`translate(0 ${n})`} d="M-150 720 Q230 70 650 400 T1700 110"/>)}</g></svg>
      <nav className="landing-nav" aria-label="Main navigation"><a className="landing-brand" href="#top">CoastWatch<span>.</span></a><div className="landing-nav-links landing-glass"><a href="#capabilities">Capabilities</a><a href="#simulation">Operations</a><a href="#workspaces">Workspaces</a></div><a className="landing-pill landing-pill-small" href="#workspaces">Enter platform<span><ArrowUpRight size={16}/></span></a></nav>
      <div className="landing-hero-content"><div className="landing-intro"><p className="landing-eyebrow"><i/>Coastal supply chain operations</p><h1 id="landing-title">Coordinate cargo<br/>from <em>sea to road.</em></h1><p className="landing-lead">CoastWatch connects port operations, logistics teams, drivers and vessel operators around the same shipment decisions.</p><div className="landing-actions"><a className="landing-pill" href="#workspaces">Open your workspace<span><ArrowUpRight size={20}/></span></a><a className="landing-secondary" href="#capabilities">See how it works</a></div></div>
        <div className="landing-journey landing-glass"><div className="landing-journey-heading"><span className="landing-eyebrow">One connected journey</span><Route size={22}/></div>{stages.map(([Icon, title, detail], index) => <div className="landing-stage" key={title}><div className="landing-stage-track"><span className="landing-glass"><Icon size={22}/></span>{index < stages.length - 1 && <i/>}</div><div><h3>{title}</h3><p>{detail}</p></div></div>)}<p className="landing-journey-footer"><Users size={18}/>Four stakeholders. Clearly owned decisions.</p></div>
      </div><div className="landing-hero-footer"><span>Built for coordinated operations</span><span>Sea / Port / Road</span></div>
    </section>

    <section className="landing-overview" aria-label="Platform at a glance">{[
      ['01', 'Shared operational picture', 'Shipment, route, port and incident information in one workspace.'],
      ['04', 'Role-based workspaces', 'The right actions for logistics, drivers, port authorities and vessel operators.'],
      ['24/7', 'Decision continuity', 'A clear record of requests, approvals, updates and operational alerts.'],
    ].map(([count, title, detail]) => <article key={title}><div className="landing-count">{count}<span> /</span></div><h2>{title}</h2><p>{detail}</p></article>)}</section>

    <section className="landing-section" id="capabilities"><div className="landing-section-heading"><div><p className="landing-eyebrow">From visibility to action</p><h2>See the disruption.<br/>Understand your options.</h2></div><p>A shared operational view, with scenario analysis to help teams make informed recovery decisions.</p></div><div className="landing-capabilities">{capabilities.map(([Icon, label, title, detail], index) => <article className="landing-card" key={title}><span className="landing-card-icon"><Icon size={22}/></span><p className="landing-eyebrow">0{index + 1} / {label}</p><h3>{title}</h3><p>{detail}</p></article>)}</div></section>

    <section id="simulation" className="landing-operations landing-noise"><div className="landing-operations-inner"><div className="landing-section-heading"><div><p className="landing-eyebrow">Operational coordination</p><h2>One decision trail<br/>from sea to road.</h2></div><p>CoastWatch keeps the people responsible for a movement on the same operational record, so the next action is clear.</p></div><div className="landing-operations-grid"><article><span><ShieldCheck size={22}/></span><h3>Safety stays explicit</h3><p>Blocked, unsafe and pending routes remain distinct from the route currently approved for the trip.</p></article><article><span><Users size={22}/></span><h3>Ownership stays visible</h3><p>Drivers, logistics teams, port authorities and vessel operators work from role-specific views.</p></article><article><span><Network size={22}/></span><h3>Updates stay connected</h3><p>Requests, incidents, cargo updates and port access decisions are reflected across the platform.</p></article></div></div></section>

    <section id="workspaces" className="landing-section"><div className="landing-section-heading"><div><p className="landing-eyebrow">Your role. Your decisions.</p><h2>A connected workspace<br/>for every stakeholder.</h2></div><p>{hasSignIn ? 'Sign in to access your assigned workspace. Your account determines your role and permissions.' : 'Choose your workspace to explore coordinated coastal operations.'}</p></div>
      {children}
      {!hasSignIn && <><div className="landing-workspaces">{Object.entries(roles).filter(([role]) => role !== 'admin').map(([role, { name, description, icon: Icon }]) => <article className="landing-card" key={role}><Icon size={26}/><h3>{name}</h3><p>{description}</p>{demoEnabled && <button disabled={busy} onClick={() => enter(role)}>{busy ? 'Opening workspace…' : `Open ${name.toLowerCase()}`}<ArrowUpRight size={19}/></button>}</article>)}</div><p className="landing-note">{demoEnabled ? 'Workspace access uses shared operational records. Sign out to switch roles.' : 'Sign-in is not configured. Ask your administrator to enable access.'}</p></>}
    </section><footer className="landing-footer"><a className="landing-brand" href="#top">CoastWatch<span>.</span></a><span>Coastal coordination. Clearly owned decisions.</span><a href="#top">Back to top ↑</a></footer>
  </div></main>
}

import { ArrowUpRight, Anchor, Ship, Truck, Route, Users, Network, GitBranch, Snowflake } from 'lucide-react'
import { roles } from '../services/roles'
import example from '../data/landing-simulation.json'
import '../landing.css'

const stages = [
  [Ship, 'Maritime transportation', 'Vessel movements & cargo visibility'],
  [Anchor, 'Port operations', 'Capacity, access & handling approvals'],
  [Truck, 'Road logistics', 'Assignments, routes & delivery updates'],
]
const capabilities = [
  [Network, 'Understand the exposure', 'Predictive disruption analysis', 'Model cascading impacts across shipments, routes and operational resources before choosing a response.'],
  [GitBranch, 'Compare the tradeoffs', 'Intelligent recovery planning', 'Compare disruption scenarios and recovery strategies by estimated cost, delay and cargo risk.'],
  [Snowflake, 'Protect sensitive cargo', 'Cold-chain risk assessment', 'Identify vulnerable temperature-sensitive cargo and prioritize operational intervention.'],
]
const inr = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
const balanced = example.strategies.find(s => s.strategy_type === 'balanced')
const fastest = example.strategies.find(s => s.strategy_type === 'fastest')
const saved = fastest.additional_cost - balanced.additional_cost
const avoided = example.baseline_delay_hours - balanced.average_delay_hours

export default function Landing({ children, enter, busy, demoEnabled, hasSignIn }) {
  return <main className="cw-landing" id="top"><div className="landing-wrap">
    <section className="landing-hero landing-noise" aria-labelledby="landing-title">
      <svg className="landing-contours" viewBox="0 0 1500 850" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="landing-ocean" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#34d399" stopOpacity=".05"/><stop offset=".5" stopColor="#047857" stopOpacity=".65"/><stop offset="1" stopColor="#07110e"/></linearGradient></defs><path d="M-200 750 Q200 100 650 430 T1750 150 L1700 950H-200Z" fill="url(#landing-ocean)"/><g fill="none" stroke="#6ee7b7" strokeOpacity=".13">{[0, 25, 50, 75, 100, 125].map(n => <path key={n} transform={`translate(0 ${n})`} d="M-150 720 Q230 70 650 400 T1700 110"/>)}</g></svg>
      <nav className="landing-nav" aria-label="Main navigation"><a className="landing-brand" href="#top">CoastWatch<span>.</span></a><div className="landing-nav-links landing-glass"><a href="#capabilities">Capabilities</a><a href="#simulation">Simulation</a><a href="#workspaces">Workspaces</a></div><a className="landing-pill landing-pill-small" href="#workspaces">Enter platform<span><ArrowUpRight size={16}/></span></a></nav>
      <div className="landing-hero-content"><div className="landing-intro"><p className="landing-eyebrow"><i/>Coastal supply chain coordination</p><h1 id="landing-title">Every leg.<br/>One clear <em>picture.</em></h1><p className="landing-lead">Connect the sea, the port and the road. Coordinate cargo, act on disruptions and keep decisions moving.</p><div className="landing-actions"><a className="landing-pill" href="#workspaces">Open your workspace<span><ArrowUpRight size={20}/></span></a><a className="landing-secondary" href="#simulation">Explore the simulation</a></div></div>
        <div className="landing-journey landing-glass"><div className="landing-journey-heading"><span className="landing-eyebrow">One connected journey</span><Route size={22}/></div>{stages.map(([Icon, title, detail], index) => <div className="landing-stage" key={title}><div className="landing-stage-track"><span className="landing-glass"><Icon size={22}/></span>{index < stages.length - 1 && <i/>}</div><div><h3>{title}</h3><p>{detail}</p></div></div>)}<p className="landing-journey-footer"><Users size={18}/>Four stakeholders. Clearly owned decisions.</p></div>
      </div><div className="landing-hero-footer"><span>Built for coordinated operations</span><span>Sea / Port / Road</span></div>
    </section>

    <section className="landing-overview" aria-label="Platform at a glance">{[
      ['04', 'Connected stakeholders', 'Port authorities, logistics companies, truck drivers and ship captains.'],
      ['03', 'Transport stages', 'Maritime transportation, port operations and road logistics, connected.'],
      ['01', 'Unified platform', 'Shipment tracking, incident reporting, approvals and disruption management.'],
    ].map(([count, title, detail]) => <article key={title}><div className="landing-count">{count}<span> /</span></div><h2>{title}</h2><p>{detail}</p></article>)}</section>

    <section className="landing-section" id="capabilities"><div className="landing-section-heading"><div><p className="landing-eyebrow">From visibility to action</p><h2>See the disruption.<br/>Understand your options.</h2></div><p>A shared operational view, with scenario analysis to help teams make informed recovery decisions.</p></div><div className="landing-capabilities">{capabilities.map(([Icon, label, title, detail], index) => <article className="landing-card" key={title}><span className="landing-card-icon"><Icon size={22}/></span><p className="landing-eyebrow">0{index + 1} / {label}</p><h3>{title}</h3><p>{detail}</p></article>)}</div></section>

    <section id="simulation" className="landing-impact landing-noise"><div className="landing-impact-inner"><div className="landing-section-heading"><div><p className="landing-eyebrow">Simulation-based estimates</p><h2>Make the tradeoffs visible.</h2><p className="landing-impact-description">A saved Chennai port-closure scenario: 72 hours, high severity.<br/>Exploring balanced recovery against explicit comparison baselines.</p></div><span className="landing-scenario landing-glass">Saved scenario · 27 Nov 2026</span></div>
      <div className="landing-metrics">{[
        [(saved / 100000).toFixed(2), 'L', 'Estimated recovery cost saved', 'Balanced versus speed-optimized recovery.', '₹'],
        [avoided.toFixed(2), ' h', 'Average delay avoided', 'Per affected shipment, versus the disrupted baseline.'],
        [example.affected_shipments, '', 'Affected shipments identified', 'Consignments exposed in this synthetic scenario.'],
        [(avoided / example.baseline_delay_hours * 100).toFixed(1), '%', 'Projected delay impact reduced', 'Average delay reduction, not an overall impact score.'],
      ].map(([value, unit, title, detail, prefix]) => <article className="landing-glass" key={title}><div className="landing-metric">{prefix}{value}<span>{unit}</span></div><h3>{title}</h3><p>{detail}</p></article>)}</div>
      <div className="landing-tradeoff"><p><strong>The tradeoff:</strong> balanced recovery takes {(balanced.average_delay_hours - fastest.average_delay_hours).toFixed(2)} hours longer than the fastest strategy. The simulator recommends the fastest strategy for this scenario.</p><p>Modeled outcomes.<br/>Not real-world savings.</p></div>
      <details className="landing-method"><summary>View calculation & source</summary><div><div><p>Recovery cost: ₹{inr(fastest.additional_cost)} − ₹{inr(balanced.additional_cost)} = ₹{inr(saved)}.</p><p>Average delay: {example.baseline_delay_hours} h disrupted − {balanced.average_delay_hours} h balanced = {avoided.toFixed(2)} h avoided.</p><p>Delay reduction: {avoided.toFixed(2)} ÷ {example.baseline_delay_hours} × 100 ≈ {(avoided / example.baseline_delay_hours * 100).toFixed(1)}%.</p></div><div><p>Source: saved CoastWatch crisis simulator run<br/><span>{example.run_id}</span>.</p><p>Synthetic network and modeled strategies. Cost and delay figures use different baselines; these are not guaranteed outcomes or live operational performance.</p></div></div></details>
    </div></section>

    <section id="workspaces" className="landing-section"><div className="landing-section-heading"><div><p className="landing-eyebrow">Your role. Your decisions.</p><h2>A connected workspace<br/>for every stakeholder.</h2></div><p>{hasSignIn ? 'Sign in to access your assigned workspace. Your account determines your role and permissions.' : 'Choose your workspace to explore coordinated coastal operations.'}</p></div>
      {children}
      {!hasSignIn && <><div className="landing-workspaces">{Object.entries(roles).map(([role, { name, description, icon: Icon }]) => <article className="landing-card" key={role}><Icon size={26}/><h3>{name}</h3><p>{description}</p>{demoEnabled && <button disabled={busy} onClick={() => enter(role)}>{busy ? 'Connecting…' : `Enter ${name.toLowerCase()} demo`}<ArrowUpRight size={19}/></button>}</article>)}</div><p className="landing-note">{demoEnabled ? 'Demo access uses the backend’s shared records. Sign out to switch roles.' : 'Sign-in is not configured. Ask your administrator to enable access.'}</p></>}
      <p className="landing-note">Tracking positions are seeded or manually reported. No live GPS/AIS feed is implied.</p>
    </section><footer className="landing-footer"><a className="landing-brand" href="#top">CoastWatch<span>.</span></a><span>Coastal coordination. Clearly owned decisions.</span><a href="#top">Back to top ↑</a></footer>
  </div></main>
}

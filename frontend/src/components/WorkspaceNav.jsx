import { useState } from 'react'
import { Anchor, Menu, X, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionButton } from './Forms'

export default function WorkspaceNav({ role, tabs, current, onSelect, user, logout, unread }) {
  const [expanded, setExpanded] = useState(false)
  return <aside className="workspace-nav">
    <Link className="workspace-brand" to="/"><Anchor aria-hidden="true" />CoastalWatch</Link>
    <p className="workspace-role">{role}</p>
    <button className="workspace-toggle" aria-expanded={expanded} aria-controls="workspace-links" onClick={() => setExpanded(!expanded)}>
      {expanded ? <X size={18} /> : <Menu size={18} />}<span>{current}</span>
    </button>
    <nav id="workspace-links" aria-label="Workspace" data-expanded={expanded}>
      {tabs.map(([name, Icon]) => <button key={name} title={name} aria-current={name === current ? 'page' : undefined}
        onClick={() => { onSelect(name); setExpanded(false) }}>
        <Icon size={17} aria-hidden="true" />{name}
        {name === 'Notifications' && unread > 0 && <span>{unread}</span>}
      </button>)}
    </nav>
    <div className="workspace-account"><strong>{user.name}</strong><small>{user.company_id || user.port_id || user.asset_id}</small>
      <ActionButton action={logout}><LogOut size={15} /> Sign out</ActionButton>
    </div>
  </aside>
}

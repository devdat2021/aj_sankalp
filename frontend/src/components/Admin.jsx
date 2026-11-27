import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ActionButton } from './Forms'
import { roles } from '../services/roles'

export default function Admin() {
  const { user, logout } = useAuth()
  return <main className="coordination-root cw-home">
    <div className="cw-row"><div><p className="cw-eyebrow">COASTWATCH ADMIN</p><h1>All workspaces</h1></div><ActionButton action={logout}>Sign out</ActionButton></div>
    <p className="cw-intro">Open any workspace to view and manage operations.</p>
    <div className="cw-role-grid">{Object.entries(user.workspaces || {}).map(([role, choices]) => {
      const Icon = roles[role].icon
      return <section className="cw-card" key={role}><Icon size={28} /><h2>{roles[role].name}</h2><p>{roles[role].description}</p><div className="cw-stack">{choices.map(item => <Link key={item.id} to={`/${role}?admin=1&scope=${encodeURIComponent(item.id)}`}>Open {item.name}</Link>)}{!choices.length && <small>No workspaces available.</small>}</div></section>
    })}</div>
  </main>
}
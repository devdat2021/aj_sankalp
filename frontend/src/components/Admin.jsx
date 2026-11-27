import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { ActionButton } from './Forms'
import { roles } from '../services/roles'
import { api } from '../services/api'

function defaultDraft(u, directory) {
  const role = u.role || u.requested_role || 'port'
  const port_id = u.port_id || directory.ports?.[0]?.id || ''
  const company_id = u.company_id || directory.companies?.[0]?.id || ''
  const vessels = directory.vessels || []
  const vehicles = directory.vehicles || []
  const firstTruck = vehicles.find(v => v.company_id === company_id)?.id || vehicles[0]?.id || ''
  const asset_id = role === 'captain'
    ? (u.asset_id || vessels[0]?.id || '')
    : role === 'driver'
      ? (u.asset_id || firstTruck)
      : ''
  return { name: u.name || '', role, port_id, company_id, asset_id }
}

export default function Admin() {
  const { user, token, logout } = useAuth()
  const [directory, setDirectory] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/admin/users', token)
      setDirectory(data)
      const nextDrafts = {}
      for (const u of data.users || []) {
        nextDrafts[u.auth_user_id] = defaultDraft(u, data)
      }
      setDrafts(nextDrafts)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api('/admin/users', token)
        if (cancelled) return
        setDirectory(data)
        const nextDrafts = {}
        for (const u of data.users || []) {
          nextDrafts[u.auth_user_id] = defaultDraft(u, data)
        }
        setDrafts(nextDrafts)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [token])

  function updateDraft(authId, patch) {
    setDrafts(prev => {
      const current = prev[authId] || {}
      const updated = { ...current, ...patch }
      if (patch.role === 'driver' && directory) {
        const comp = updated.company_id || directory.companies?.[0]?.id || ''
        updated.company_id = comp
        const matchingTruck = (directory.vehicles || []).find(v => v.company_id === comp && v.id === updated.asset_id)
          || (directory.vehicles || []).find(v => v.company_id === comp)
        updated.asset_id = matchingTruck?.id || ''
      } else if (patch.company_id && updated.role === 'driver' && directory) {
        const matchingTruck = (directory.vehicles || []).find(v => v.company_id === patch.company_id)
        updated.asset_id = matchingTruck?.id || ''
      } else if (patch.role === 'captain' && directory) {
        const hasVessel = (directory.vessels || []).some(v => v.id === updated.asset_id)
        updated.asset_id = hasVessel ? updated.asset_id : (directory.vessels?.[0]?.id || '')
      } else if (patch.role === 'port' && directory) {
        updated.port_id = updated.port_id || directory.ports?.[0]?.id || ''
      } else if (patch.role === 'logistics' && directory) {
        updated.company_id = updated.company_id || directory.companies?.[0]?.id || ''
      }
      return { ...prev, [authId]: updated }
    })
  }

  async function saveUser(u) {
    const d = drafts[u.auth_user_id]
    if (!d) return
    setBusyId(u.auth_user_id)
    setError('')
    setNotice('')
    try {
      const payload = {
        name: d.name.trim() || u.name || u.email || 'Operator',
        ...(u.email ? { email: u.email } : {}),
        role: d.role,
        active: true,
        ...(d.role === 'port' ? { port_id: d.port_id } : {}),
        ...(d.role === 'logistics' || d.role === 'driver' ? { company_id: d.company_id } : {}),
        ...(d.role === 'driver' || d.role === 'captain' ? { asset_id: d.asset_id } : {}),
      }
      await api(`/admin/users/${u.auth_user_id}`, token, 'PUT', payload)
      setNotice(`Saved ${u.email || payload.name} as ${roles[d.role]?.name || d.role}.`)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function disableUser(u) {
    if (!u.id) return
    setBusyId(u.auth_user_id)
    setError('')
    setNotice('')
    try {
      await api(`/admin/users/${u.id}/disable`, token, 'PATCH')
      setNotice(`Disabled access for ${u.email || u.name}.`)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  const users = directory?.users || []
  const sortedUsers = [...users].sort((a, b) => {
    const rank = { pending: 0, active: 1, disabled: 2 }
    return (rank[a.status] ?? 3) - (rank[b.status] ?? 3)
  })

  return (
    <main className="coordination-root cw-home">
      <div className="cw-row">
        <div>
          <p className="cw-eyebrow">COASTWATCH ADMIN</p>
          <h1>All workspaces</h1>
        </div>
        <ActionButton action={logout}>Sign out</ActionButton>
      </div>
      <p className="cw-intro">Open any workspace to view and manage operations.</p>
      <div className="cw-role-grid">
        {Object.entries(user.workspaces || {}).map(([role, choices]) => {
          const Icon = roles[role].icon
          return (
            <section className="cw-card" key={role}>
              <Icon size={28} />
              <h2>{roles[role].name}</h2>
              <p>{roles[role].description}</p>
              <div className="cw-stack">
                {choices.map(item => (
                  <Link key={item.id} to={`/${role}?admin=1&scope=${encodeURIComponent(item.id)}`}>
                    Open {item.name}
                  </Link>
                ))}
                {!choices.length && <small>No workspaces available.</small>}
              </div>
            </section>
          )
        })}
      </div>

      <section className="cw-card" style={{ marginTop: 28 }}>
        <div className="cw-row" style={{ marginBottom: 12 }}>
          <div>
            <p className="cw-eyebrow">ACCESS CONTROL</p>
            <h2 style={{ margin: 0 }}>Registered &amp; Pending Users</h2>
          </div>
          <button type="button" className="secondary" onClick={loadUsers} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh users'}
          </button>
        </div>
        <p className="cw-muted" style={{ marginBottom: 14 }}>
          Approve new accounts, assign their operational role and scope, or disable access. Roles are enforced server-side from MongoDB.
        </p>

        {error && <div className="cw-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
        {notice && <div className="cw-card" role="status" style={{ marginBottom: 12, padding: '10px 14px', background: '#ecfdf5', borderColor: '#a7f3d0' }}>{notice}</div>}

        {loading && !directory ? (
          <p className="cw-muted">Loading registered users…</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Assigned Role</th>
                  <th>Scope Assignment</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map(u => {
                  const d = drafts[u.auth_user_id] || defaultDraft(u, directory || {})
                  const busy = busyId === u.auth_user_id
                  const isSelf = u.id && u.id === user.id
                  const companyTrucks = (directory?.vehicles || []).filter(v => v.company_id === d.company_id)
                  return (
                    <tr key={u.auth_user_id}>
                      <td>
                        <strong>{u.email || u.name}</strong>
                        {u.email && <div className="cw-muted" style={{ fontSize: 12 }}>{u.name}</div>}
                        {u.email_confirmed === false && <div className="cw-muted" style={{ fontSize: 11 }}>Email unconfirmed</div>}
                      </td>
                      <td>
                        <span className={`cw-badge ${u.status === 'active' ? 'confirmed' : u.status === 'pending' ? 'slot_suggested' : ''}`}>
                          {u.status}
                        </span>
                      </td>
                      <td>{u.requested_role ? (roles[u.requested_role]?.name || u.requested_role) : '—'}</td>
                      <td>
                        <select
                          aria-label={`Role for ${u.email || u.name}`}
                          value={d.role}
                          disabled={busy || isSelf}
                          onChange={e => updateDraft(u.auth_user_id, { role: e.target.value })}
                        >
                          {Object.entries(roles).map(([key, info]) => (
                            <option key={key} value={key}>{info.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {d.role === 'admin' && <span className="cw-muted">All workspaces</span>}
                        {d.role === 'port' && (
                          <select
                            aria-label={`Port for ${u.email || u.name}`}
                            value={d.port_id}
                            disabled={busy}
                            onChange={e => updateDraft(u.auth_user_id, { port_id: e.target.value })}
                          >
                            {(directory?.ports || []).map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                            ))}
                          </select>
                        )}
                        {(d.role === 'logistics' || d.role === 'driver') && (
                          <div style={{ display: 'grid', gap: 6 }}>
                            <select
                              aria-label={`Company for ${u.email || u.name}`}
                              value={d.company_id}
                              disabled={busy}
                              onChange={e => updateDraft(u.auth_user_id, { company_id: e.target.value })}
                            >
                              {(directory?.companies || []).map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                              ))}
                            </select>
                            {d.role === 'driver' && (
                              <select
                                aria-label={`Truck for ${u.email || u.name}`}
                                value={d.asset_id}
                                disabled={busy}
                                onChange={e => updateDraft(u.auth_user_id, { asset_id: e.target.value })}
                              >
                                {companyTrucks.map(v => (
                                  <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                        {d.role === 'captain' && (
                          <select
                            aria-label={`Vessel for ${u.email || u.name}`}
                            value={d.asset_id}
                            disabled={busy}
                            onChange={e => updateDraft(u.auth_user_id, { asset_id: e.target.value })}
                          >
                            {(directory?.vessels || []).map(v => (
                              <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" disabled={busy} onClick={() => saveUser(u)}>
                            {busy ? 'Saving…' : u.status === 'active' ? 'Update' : 'Approve & assign'}
                          </button>
                          {u.active && !isSelf && (
                            <button type="button" className="secondary" disabled={busy} onClick={() => disableUser(u)}>
                              Disable
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!sortedUsers.length && (
                  <tr>
                    <td colSpan={6} className="cw-muted">No registered users found yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

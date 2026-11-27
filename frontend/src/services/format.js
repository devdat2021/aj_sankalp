export const iso = value => new Date(value).toISOString()
export const stamp = value => value ? new Date(value).toLocaleString() : 'Not scheduled'
export const options = rows => rows.map(s => ({ value: s.id, label: `${s.cargo || s.name || s.id} · ${s.id}` }))

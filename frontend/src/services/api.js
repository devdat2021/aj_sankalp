export async function api(path, token, method = 'GET', body, signal) {
  const response = await fetch(`${import.meta.env?.VITE_API_BASE_URL || ''}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload?.detail
    const message = Array.isArray(detail) ? detail.map(e => `${e.loc?.slice(1).join('.')}: ${e.msg}`).join('; ') : detail
    const error = new Error(message || `Request failed (${response.status}). Please retry.`)
    error.status = response.status
    throw error
  }
  return payload
}

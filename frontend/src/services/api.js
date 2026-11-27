export async function api(path, token, method = 'GET', body, signal, timeoutMs = 15000) {
  const workspaceHeaders = {}
  if (typeof window !== 'undefined' && !path.startsWith('/me') && !path.startsWith('/admin/')) {
    const params = new URLSearchParams(window.location.search)
    if (params.get('admin') === '1') {
      workspaceHeaders['X-Workspace-Role'] = window.location.pathname.split('/')[1]
      if (params.get('scope')) workspaceHeaders['X-Workspace-Scope'] = params.get('scope')
    }
  }
  const response = await fetch(`${import.meta.env?.VITE_API_BASE_URL || ''}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...workspaceHeaders, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
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

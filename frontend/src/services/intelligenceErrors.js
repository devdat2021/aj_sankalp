export function intelligenceErrorMessage(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'The request timed out. Refresh and try again.'
  switch (error?.status) {
    case 401: return 'Your session has expired. Sign in again to continue.'
    case 403: return 'Your role is not permitted to change these inputs.'
    case 409: return 'Operational data changed. Refresh the workspace before trying again.'
    case 422: return 'Some values are invalid. Check the required dates, numbers and coordinates.'
    case 429: return 'The analysis queue is busy or this analysis ran recently. Wait briefly, then refresh.'
    case 503: return 'Operational intelligence is unavailable or disabled. Check the service status.'
    default: return 'The request could not be completed. Check your connection and try again.'
  }
}

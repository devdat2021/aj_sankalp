const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const hasSupabase = Boolean(url && key)
export const allowDemo = import.meta.env.VITE_ENABLE_DEMO === 'true' || (import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO !== 'false')

let supabasePromise
export function getSupabase() {
  if (!hasSupabase) return Promise.resolve(null)
  if (!supabasePromise) {
    supabasePromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(url, key))
      .catch(error => {
        supabasePromise = null
        throw error
      })
  }
  return supabasePromise
}

# Shared primitives
Field, ActionForm, ActionButton, Badge, Empty: labels, inputs, pending/error handling.

## frontend/src/components/Forms.jsx
```
import { useState } from 'react'

export function Field({ label, name, options, type = 'text', required = true, value, ...props }) {
  return <label className="cw-field"><span>{label}</span>{options ? <select name={name} required={required} defaultValue={value} {...props}>{options.map(o => <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>{typeof o === 'string' ? o.replaceAll('_', ' ') : o.label}</option>)}</select> : type === 'textarea' ? <textarea name={name} required={required} defaultValue={value} {...props} /> : <input name={name} type={type} required={required} defaultValue={value} {...props} />}</label>
}

export function ActionForm({ children, submit, label = 'Save', reset = false, disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  async function onSubmit(event) {
    event.preventDefault()
    const form = event.currentTarget
    setBusy(true); setError(''); setSuccess('')
    try {
      const saved = await submit(Object.fromEntries(new FormData(form)))
      if (saved === false) return
      setSuccess('Saved successfully.')
      if (reset) form.reset()
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return <form onSubmit={onSubmit} className="cw-form"><fieldset disabled={busy || disabled}>{children}<button className="cw-primary" type="submit">{busy ? 'Saving…' : label}</button></fieldset>{error && <p className="cw-error" role="alert">{error}</p>}{success && <p className="cw-success" role="status">{success}</p>}</form>
}

export function ActionButton({ action, children, disabled = false }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <div><button disabled={disabled || busy} onClick={async () => { setBusy(true); setError(''); try { await action() } catch (err) { setError(err.message) } finally { setBusy(false) } }}>{busy ? 'Saving…' : children}</button>{error && <p role="alert" className="cw-error">{error}</p>}</div>
}

export function Badge({ children }) { return <span className={`cw-badge ${children}`}>{String(children || 'unknown').replaceAll('_', ' ')}</span> }
export function Empty({ children = 'No records yet.' }) { return <p className="cw-empty">{children}</p> }

```

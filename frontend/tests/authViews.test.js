import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

let vite, AuthPage, AuthContext
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  AuthPage = (await vite.ssrLoadModule('/src/components/AuthPage.jsx')).default
  AuthContext = (await vite.ssrLoadModule('/src/components/AuthContext.js')).AuthContext
})
after(async () => { await vite?.close() })

function render(mode, state = {}) {
  return renderToStaticMarkup(createElement(MemoryRouter, null,
    createElement(AuthContext.Provider, { value: { user: null, loading: false, ...state } },
      createElement(AuthPage, { mode }))))
}

test('registration collects identity and confirms password without granting a role', () => {
  const html = render('register')
  assert.match(html, /name="name"/)
  assert.match(html, /name="email"/)
  assert.match(html, /name="confirm"/)
  assert.match(html, /minLength="8"/)
  assert.match(html, /autoComplete="new-password"/)
  assert.doesNotMatch(html, /name="role"/)
  assert.match(html, /href="\/login"/)
})

test('login uses password manager fields and offers registration', () => {
  const html = render('login')
  assert.match(html, /autoComplete="current-password"/)
  assert.match(html, /autoComplete="username"/)
  assert.doesNotMatch(html, /name="confirm"/)
  assert.match(html, /href="\/register"/)
})

test('unmapped authenticated users see an account identifier and can retry access or sign out', () => {
  const html = render('login', { error: 'Active user mapping required', accountId: 'user-awaiting-approval' })
  assert.match(html, /user-awaiting-approval/)
  assert.match(html, /Check access again/)
  assert.match(html, /Sign out/)
  assert.match(html, /role="alert"/)
})

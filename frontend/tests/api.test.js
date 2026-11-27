import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api } from '../src/services/api.js'

test('authenticated mutation sends bearer token and JSON payload', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/route-requests/REQ-1')
    assert.equal(options.headers.Authorization, 'Bearer test-session')
    assert.equal(options.method, 'PATCH')
    assert.deepEqual(JSON.parse(options.body), { status: 'rejected', reason: 'Road blocked' })
    return Response.json({ status: 'rejected' })
  })
  assert.deepEqual(await api('/route-requests/REQ-1', 'test-session', 'PATCH', { status: 'rejected', reason: 'Road blocked' }), { status: 'rejected' })
})

test('validation errors identify the form field', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: [{ loc: ['body', 'slot'], msg: 'Timezone required' }] }, { status: 422 }))
  await assert.rejects(api('/port-requests/x', 'test'), error => error.status === 422 && error.message === 'slot: Timezone required')
})

test('expired sessions retain status and non-JSON failures remain readable', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Invalid or expired token' }, { status: 401 }))
  await assert.rejects(api('/me', 'expired'), error => error.status === 401 && error.message === 'Invalid or expired token')
  globalThis.fetch.mock.mockImplementation(async () => new Response('proxy offline', { status: 502 }))
  await assert.rejects(api('/me', 'test'), /Request failed \(502\)/)
})

test('health request does not send an invented identity', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.Authorization, undefined)
    assert.equal(options.body, undefined)
    return Response.json({ demo_mode: true })
  })
  assert.equal((await api('/health')).demo_mode, true)
})

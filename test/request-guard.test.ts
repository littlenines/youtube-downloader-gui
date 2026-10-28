import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isLoopbackHost } from '@shared/loopback.js'
import { isForbiddenRequest, isLoopbackRequest } from '@server/security/request-guard.js'

const request = (method: string, headers: Record<string, string>) => ({ method, headers })
const local = { loopbackOnly: true }

describe('isForbiddenRequest', () => {
  it('allows the app’s own page', () => {
    assert.equal(isForbiddenRequest(request('GET', { host: '127.0.0.1:5199' }), local), false)
    assert.equal(
      isForbiddenRequest(request('POST', { host: 'localhost:5190', origin: 'http://localhost:5190' }), local),
      false,
    )
    assert.equal(isForbiddenRequest(request('GET', { host: '[::1]:5190' }), local), false)
  })

  it('refuses POSTs from other websites', () => {
    assert.equal(
      isForbiddenRequest(request('POST', { host: '127.0.0.1:5199', origin: 'https://evil.example' }), local),
      true,
    )
  })

  it('refuses DNS rebinding, where another site’s name points at this computer', () => {
    const rebound = { host: 'evil.example:5190', origin: 'http://evil.example:5190' }

    assert.equal(isForbiddenRequest(request('POST', rebound), local), true)
    assert.equal(isForbiddenRequest(request('GET', { host: 'evil.example:5190' }), local), true)
  })

  it('allows other host names only when the server was deliberately shared', () => {
    const shared = { loopbackOnly: false }

    assert.equal(isForbiddenRequest(request('GET', { host: '192.168.1.20:5190' }), shared), false)
    assert.equal(
      isForbiddenRequest(request('POST', { host: '192.168.1.20:5190', origin: 'https://evil.example' }), shared),
      true,
    )
  })

  it('refuses requests without a Host header', () => {
    assert.equal(isForbiddenRequest(request('GET', {}), local), true)
  })
})

describe('isLoopbackHost', () => {
  it('recognises the addresses that only this computer can reach', () => {
    assert.deepEqual(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '192.168.1.20'].map(isLoopbackHost), [
      true,
      true,
      true,
      false,
      false,
    ])
  })
})

describe('isLoopbackRequest', () => {
  it('tells a request from this computer from one over the network', () => {
    const requestTo = (host: string | undefined) => ({ headers: { host } })

    assert.deepEqual(
      ['127.0.0.1:5199', 'localhost:5199', '[::1]:5199', '192.168.1.20:5199', undefined].map((host) =>
        isLoopbackRequest(requestTo(host)),
      ),
      [true, true, true, false, false],
    )
  })
})

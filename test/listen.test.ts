import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { describe, it } from 'node:test'
import { listenForFetch } from './support/listen.js'

describe('listenForFetch', () => {
  it('listens again when the system picks a port that fetch refuses, such as 6000', async () => {
    const portsGiven = [6000, 10080, 52311]
    let port = 0
    let closeCount = 0
    const server = {
      listen: (_port: number, _host: string, onListening: () => void) => {
        port = portsGiven.shift() ?? 0
        onListening()
      },
      address: () => ({ port }),
      close: (onClosed: () => void) => {
        closeCount++
        onClosed()
      },
    } as unknown as Server

    assert.deepEqual([await listenForFetch(server), closeCount], ['http://127.0.0.1:52311', 2])
  })
})

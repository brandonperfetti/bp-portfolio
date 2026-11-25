// @vitest-environment node
import net from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertPortFree,
  LOCAL_SERVICES,
  PORT_FAMILY,
  portFor,
  UNSAFE_FAMILY_PORT,
} from './local-ports.mjs'

/**
 * The port assignments of #285 and the refusals that keep a local server on
 * them.
 */
describe('portFor', () => {
  it('assigns the reserved defaults', () => {
    expect(portFor('dev', {})).toBe(6002)
    expect(portFor('e2e', {})).toBe(6001)
    expect(portFor('storybook', {})).toBe(6006)
  })

  it('keeps every default inside the family and off the unsafe port', () => {
    for (const { port } of Object.values(LOCAL_SERVICES)) {
      expect(port).toBeGreaterThanOrEqual(PORT_FAMILY.min)
      expect(port).toBeLessThanOrEqual(PORT_FAMILY.max)
      expect(port).not.toBe(UNSAFE_FAMILY_PORT)
    }
  })

  it('honours an override inside the family', () => {
    expect(portFor('dev', { BP_DEV_PORT: '6012' })).toBe(6012)
    expect(portFor('e2e', { BP_E2E_PORT: '6029' })).toBe(6029)
    expect(portFor('storybook', { BP_STORYBOOK_PORT: '6016' })).toBe(6016)
  })

  it('treats an empty override as unset', () => {
    // `.env.example` keys are blanked by the reader lab's clean environment.
    expect(portFor('e2e', { BP_E2E_PORT: '' })).toBe(6001)
  })

  it.each(['6000', '5999', '6030', '3000', '6001x', ' 6001', '-6001', '6e3'])(
    'rejects the override %j with the variable named',
    (value) => {
      expect(() => portFor('dev', { BP_DEV_PORT: value })).toThrow(
        /^BP_DEV_PORT must be a decimal port from 6001 to 6029/,
      )
    },
  )

  it('rejects an unknown service', () => {
    expect(() => portFor('admin', {})).toThrow(/Unknown local port service/)
  })
})

describe('assertPortFree', () => {
  let holder: net.Server | undefined

  afterEach(async () => {
    await new Promise((resolve) => holder?.close(resolve) ?? resolve(null))
    holder = undefined
  })

  /** Hold an ephemeral loopback port, as another project's server would. */
  async function hold(host: string) {
    holder = net.createServer()
    await new Promise<void>((resolve) => holder!.listen(0, host, resolve))
    return (holder.address() as net.AddressInfo).port
  }

  it('fails clearly when the IPv4 loopback port is taken', async () => {
    const port = await hold('127.0.0.1')
    await expect(assertPortFree('e2e', port)).rejects.toThrow(
      new RegExp(
        `^Port ${port} for BP Portfolio's e2e server is not available on 127\\.0\\.0\\.1 \\(EADDRINUSE\\).*BP_E2E_PORT=<port>.*never moves to a different port`,
      ),
    )
  })

  it('passes once the port is released', async () => {
    const port = await hold('127.0.0.1')
    await new Promise((resolve) => holder!.close(resolve))
    holder = undefined
    await expect(assertPortFree('e2e', port)).resolves.toBeUndefined()
  })
})

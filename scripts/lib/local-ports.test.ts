// @vitest-environment node
import net from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertNoPortArgs,
  assertPortFree,
  LOCAL_SERVICES,
  PORT_FAMILY,
  portFor,
  serverCommand,
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

  it('rejects an override onto another service’s default', () => {
    expect(() => portFor('dev', { BP_DEV_PORT: '6001' })).toThrow(
      /^BP_DEV_PORT=6001 is the e2e server's default/,
    )
    expect(() => portFor('e2e', { BP_E2E_PORT: '6006' })).toThrow(
      /is the storybook server's default/,
    )
  })

  it('accepts an override equal to its own default', () => {
    expect(portFor('dev', { BP_DEV_PORT: '6002' })).toBe(6002)
  })

  it('rejects an unknown service', () => {
    expect(() => portFor('admin', {})).toThrow(/Unknown local port service/)
  })
})

describe('serverCommand', () => {
  it('starts dev mode with an explicit port', () => {
    expect(serverCommand('dev', 6002, { ci: false })).toEqual({
      bin: 'next',
      args: ['dev', '--turbopack', '--port', '6002'],
    })
  })

  it('serves the production build for e2e under CI, dev mode otherwise', () => {
    expect(serverCommand('e2e', 6001, { ci: true })).toEqual({
      bin: 'next',
      args: ['start', '--port', '6001'],
    })
    expect(serverCommand('e2e', 6001, { ci: false })).toEqual({
      bin: 'next',
      args: ['dev', '--turbopack', '--port', '6001'],
    })
  })

  it('pins Storybook to its port with --exact-port', () => {
    expect(serverCommand('storybook', 6006, { ci: false })).toEqual({
      bin: 'storybook',
      args: ['dev', '--port', '6006', '--exact-port'],
    })
  })
})

describe('assertNoPortArgs', () => {
  it.each([
    ['--port', '3000'],
    ['--port=3000'],
    ['-p', '3000'],
    ['-p3000'],
    ['--ci', '--port', '6010'],
  ])('refuses the forwarded port option in %j', (...args) => {
    expect(() => assertNoPortArgs('dev', args)).toThrow(
      /cannot set the dev server's port; use BP_DEV_PORT=<port>/,
    )
  })

  it('keeps unrelated options', () => {
    expect(() =>
      assertNoPortArgs('storybook', ['--ci', '--no-open', '--debug']),
    ).not.toThrow()
    expect(() =>
      assertNoPortArgs('dev', ['--experimental-https']),
    ).not.toThrow()
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
    const server = net.createServer()
    holder = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
    return (server.address() as net.AddressInfo).port
  }

  it('fails clearly when the IPv4 loopback port is taken', async () => {
    const port = await hold('127.0.0.1')
    await expect(assertPortFree('e2e', port)).rejects.toThrow(
      new RegExp(
        `^Port ${port} for BP Portfolio's e2e server is not available on 127\\.0\\.0\\.1 \\(EADDRINUSE\\).*BP_E2E_PORT=<port>.*never moves to a different port`,
      ),
    )
  })

  it('fails clearly when only the IPv6 loopback holds the port', async ({
    skip,
  }) => {
    // A server bound to `localhost` on macOS takes `::1`; the `::` wildcard
    // probe alone would not see it.
    let port: number
    try {
      port = await hold('::1')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EADDRNOTAVAIL' && code !== 'EAFNOSUPPORT') throw error
      skip('IPv6 loopback is unavailable on this host')
      return
    }
    await expect(assertPortFree('dev', port)).rejects.toThrow(
      new RegExp(
        `^Port ${port} for BP Portfolio's dev server is not available on ::1 `,
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

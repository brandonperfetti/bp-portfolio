import net from 'node:net'
import process from 'node:process'

/**
 * BP Portfolio's reserved local port family (#285): `6000`–`6029`.
 *
 * @remarks Each active Sans Faux project owns one memorable family (Brandon,
 * 2026-10-23) so they can run side by side with stable URLs. `6000` itself is
 * inside the family but unusable: it is X11's port, so Chromium refuses it
 * (`net::ERR_UNSAFE_PORT`), Node's `fetch` refuses it (`bad port`) and Next
 * refuses to listen on it (`Bad port: "6000" is reserved for x11`,
 * `next/dist/lib/helpers/get-reserved-port.js`). The app's default therefore
 * sits at `6002`, and an override to `6000` is rejected here rather than
 * failing later in a browser.
 */
export const PORT_FAMILY = Object.freeze({ min: 6000, max: 6029 })

/** The one port in {@link PORT_FAMILY} that browsers, Node and Next refuse. */
export const UNSAFE_FAMILY_PORT = 6000

/**
 * Every local server this repo starts, with its override variable and default.
 *
 * @remarks `dev` is `pnpm dev`; `e2e` is the Playwright-managed server and the
 * reader-journey lab's owned instance (both are what `use.baseURL` points at,
 * so they share one assignment); `storybook` is `pnpm storybook`.
 */
export const LOCAL_SERVICES = Object.freeze({
  dev: Object.freeze({ variable: 'BP_DEV_PORT', port: 6002 }),
  e2e: Object.freeze({ variable: 'BP_E2E_PORT', port: 6001 }),
  storybook: Object.freeze({ variable: 'BP_STORYBOOK_PORT', port: 6006 }),
})

/**
 * The port a local service should listen on.
 *
 * @remarks An override (for a parallel worktree) must be a decimal port inside
 * {@link PORT_FAMILY}, not {@link UNSAFE_FAMILY_PORT}, and not another
 * service's default; anything else throws with the variable's name, so a typo
 * never lands a server outside the family, on a port the browser will not
 * open, or on the port another service of this checkout expects. Resolves configuration only: the
 * caller must still fail on a collision (see {@link assertPortFree}).
 *
 * @param {string} service - A key of {@link LOCAL_SERVICES}.
 * @param {Record<string, string | undefined>} [env] - The environment to read
 * the override from.
 * @returns {number} The validated port.
 */
export function portFor(service, env = process.env) {
  if (!Object.hasOwn(LOCAL_SERVICES, service)) {
    throw new Error(`Unknown local port service: ${String(service)}`)
  }
  const { variable, port: fallback } =
    LOCAL_SERVICES[/** @type {keyof typeof LOCAL_SERVICES} */ (service)]
  const value = env[variable]
  if (value === undefined || value === '') return fallback

  const port = Number(value)
  if (
    !/^\d+$/.test(value) ||
    port < PORT_FAMILY.min ||
    port > PORT_FAMILY.max ||
    port === UNSAFE_FAMILY_PORT
  ) {
    throw new Error(
      `${variable} must be a decimal port from ${PORT_FAMILY.min + 1} to ${PORT_FAMILY.max} ` +
        `(BP Portfolio's ${PORT_FAMILY.min}–${PORT_FAMILY.max} family; ${UNSAFE_FAMILY_PORT} is ` +
        `refused by browsers); received ${JSON.stringify(value)}`,
    )
  }
  const owner = Object.entries(LOCAL_SERVICES).find(
    ([name, assigned]) => name !== service && assigned.port === port,
  )
  if (owner) {
    throw new Error(
      `${variable}=${port} is the ${owner[0]} server's default; pick a port no ` +
        `service is assigned (${Object.values(LOCAL_SERVICES)
          .map((assigned) => assigned.port)
          .join(', ')} are taken)`,
    )
  }
  return port
}

/**
 * Try to bind one host and port, then release it.
 *
 * @param {number} port - The port to bind.
 * @param {string} host - The address to bind it on.
 * @returns {Promise<string | null>} `null` when the bind succeeded or the address family is absent on
 * this machine, otherwise the bind error's code.
 */
function probe(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', (error) => {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code ?? 'ERROR'
      resolve(code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT' ? null : code)
    })
    server.listen({ port, host, exclusive: true }, () => {
      server.close(() => resolve(null))
    })
  })
}

/**
 * Refuse to start when anything already listens on the port.
 *
 * @remarks Next and Storybook can both move to the next free port on a
 * collision; the launcher passes them an explicit port (`--port`,
 * `--exact-port`) so they cannot, and this check gives the failure a message
 * that names the service and its override. It probes the IPv4 loopback, the
 * IPv6 loopback and the IPv6 wildcard separately because a listener on one
 * specific address does not stop a later bind on the wildcard, which would
 * leave two servers answering the same port number on different addresses;
 * `::1` matters most on macOS, where `localhost` resolves to it first.
 *
 * @param {keyof typeof LOCAL_SERVICES} service - A key of
 * {@link LOCAL_SERVICES}, for the message.
 * @param {number} port - The port to check.
 * @throws When the port is taken on either address.
 */
export async function assertPortFree(service, port) {
  for (const host of ['127.0.0.1', '::1', '::']) {
    const code = await probe(port, host)
    if (code === null) continue
    const { variable } = LOCAL_SERVICES[service]
    throw new Error(
      `Port ${port} for BP Portfolio's ${service} server is not available on ${host} (${code}). ` +
        `Stop whatever is listening there (lsof -nP -iTCP:${port} -sTCP:LISTEN), or pick another ` +
        `free port from ${PORT_FAMILY.min + 1}–${PORT_FAMILY.max} with ${variable}=<port>. ` +
        'This command never moves to a different port on its own.',
    )
  }
}

/**
 * The program and arguments that start a service on a port.
 *
 * @remarks Kept here, beside the port table, so the one decision with a
 * branch (CI serves the production build it just made with `next start`; a
 * local e2e run uses `next dev`, as `playwright.config.ts` always has) is
 * tested. The port is always passed explicitly: Next retries other ports only
 * when the port came from its own default, and Storybook only without
 * `--exact-port`.
 *
 * @param {keyof typeof LOCAL_SERVICES} service - The service to start.
 * @param {number} port - Its resolved port.
 * @param {{ ci: boolean }} options - Whether this is a CI run.
 * @returns {{ bin: 'next' | 'storybook', args: string[] }} The package whose
 * bin to run, and its arguments.
 */
export function serverCommand(service, port, { ci }) {
  const nextDev = ['dev', '--turbopack', '--port', String(port)]
  switch (service) {
    case 'dev':
      return { bin: 'next', args: nextDev }
    case 'e2e':
      return {
        bin: 'next',
        args: ci ? ['start', '--port', String(port)] : nextDev,
      }
    case 'storybook':
      return {
        bin: 'storybook',
        args: ['dev', '--port', String(port), '--exact-port'],
      }
    default:
      throw new Error(`Unknown local port service: ${String(service)}`)
  }
}

/**
 * Refuse forwarded arguments that would pick the port themselves.
 *
 * @remarks The launcher appends extra arguments after its own `--port`, and
 * Next and Storybook both take the last port option they see, so
 * `pnpm dev --port 3000` would start on a port that was never checked and sits
 * outside the family. The override variables are the one way to move a port.
 *
 * @param {keyof typeof LOCAL_SERVICES} service - The service being started,
 * for the message.
 * @param {string[]} args - The arguments forwarded to it.
 * @throws When any argument sets the port.
 */
export function assertNoPortArgs(service, args) {
  const portArg = args.find(
    (arg) =>
      arg === '--port' ||
      arg.startsWith('--port=') ||
      arg === '-p' ||
      /^-p\d/.test(arg),
  )
  if (portArg === undefined) return
  const { variable } = LOCAL_SERVICES[service]
  throw new Error(
    `${JSON.stringify(portArg)} cannot set the ${service} server's port; use ` +
      `${variable}=<port> (${PORT_FAMILY.min + 1}–${PORT_FAMILY.max}) instead.`,
  )
}

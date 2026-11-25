#!/usr/bin/env node
/**
 * Start one of BP Portfolio's local servers on its reserved port (#285).
 *
 * Usage: `node scripts/local-server.mjs <dev|e2e|storybook> [extra args]`
 *
 * `pnpm dev`, `pnpm storybook` and Playwright's `webServer` all come through
 * here so the port is resolved in one place (`scripts/lib/local-ports.mjs`),
 * checked free before the server starts, and passed explicitly, which turns
 * off both Next's and Storybook's move-to-the-next-port fallback. The port
 * family and overrides are documented in README.md § Local ports.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

import {
  assertNoPortArgs,
  assertPortFree,
  LOCAL_SERVICES,
  portFor,
  serverCommand,
} from './lib/local-ports.mjs'

const require = createRequire(import.meta.url)
const [service, ...extra] = process.argv.slice(2)

/**
 * The file a package's `bin` names, resolved through its `package.json`.
 *
 * @remarks Storybook's `exports` map does not expose its bin script as a
 * subpath, so `require.resolve('storybook/dist/bin/…')` throws; the manifest
 * is exported, and its `bin` field is the stable name for the entry point.
 */
function binOf(name) {
  const manifest = require.resolve(`${name}/package.json`)
  const { bin } = require(manifest)
  return path.join(
    path.dirname(manifest),
    typeof bin === 'string' ? bin : bin[name],
  )
}

try {
  if (!Object.hasOwn(LOCAL_SERVICES, service)) {
    throw new Error(
      `Usage: node scripts/local-server.mjs <${Object.keys(LOCAL_SERVICES).join('|')}> [args]`,
    )
  }
  assertNoPortArgs(service, extra)
  const port = portFor(service)
  await assertPortFree(service, port)
  const { bin, args } = serverCommand(service, port, {
    ci: Boolean(process.env.CI),
  })
  const child = spawn(process.execPath, [binOf(bin), ...args, ...extra], {
    stdio: 'inherit',
  })
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal))
  }
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0)
  })
} catch (error) {
  console.error(
    `[local-server] ${error instanceof Error ? error.message : error}`,
  )
  process.exitCode = 1
}

#!/usr/bin/env node
/**
 * Publish → sitemap → unpublish freshness probe (#294).
 *
 * Publishes a throwaway page (and, with `--article`, an article) through one
 * write path, `rest` (the Payload REST API `/admin` calls) or `mcp`
 * (`POST /api/mcp`), and checks that `/sitemap.xml` and the probe URL pick up
 * the publish and then the unpublish. It deletes the probes in a `finally`,
 * whatever failed, and checks nothing is left. Run on demand only: it is not
 * a CI step or a monitor. Logic and tests: `scripts/lib/freshness-probe.mjs`.
 *
 * ```
 * pnpm probe:freshness --write-path rest --evidence <new dir>
 * pnpm probe:freshness --write-path mcp --target staging --allow-staging-writes --article --evidence <new dir>
 * ```
 *
 * Exit codes: 0 PASS, 1 FAIL (probes cleaned up), 2 refused before any write,
 * 3 cleanup incomplete — read the log for what may remain. `docs/SEO.md`
 * § Indexing surfaces says when to run it.
 */
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import {
  BYPASS_HEADER,
  EXIT,
  RefusalError,
  USAGE,
  createEvidence,
  createMcpWriter,
  createRestWriter,
  exitCodeFor,
  parseArgs,
  readCredentials,
  resolvePlan,
  runProbe,
  scrubEvidence,
} from './lib/freshness-probe.mjs'

const log = (/** @type {string} */ line) => process.stdout.write(`${line}\n`)

/** Set once the probe may have written: a crash after it may leave probes. */
let mayHaveWritten = false

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    log(USAGE)
    return EXIT.pass
  }
  const plan = resolvePlan(args)
  const envLocal = existsSync('.env.local')
    ? readFileSync('.env.local', 'utf8')
    : null
  const creds = readCredentials(plan, process.env, envLocal)
  const evidence = createEvidence(plan.evidenceDir)
  const extraHeaders = creds.bypass ? { [BYPASS_HEADER]: creds.bypass } : {}
  log(
    `freshness probe: target=${plan.target} base=${plan.base} write-path=${plan.writePath} probes=${plan.kinds.join(',')} evidence=${evidence.dir}`,
  )

  const writer =
    plan.writePath === 'rest'
      ? await createRestWriter({
          base: plan.base,
          fetch,
          extraHeaders,
          email: creds.email,
          password: creds.password,
        })
      : await createMcpWriter({
          base: plan.base,
          fetch,
          extraHeaders,
          apiKey: creds.apiKey,
        })

  const controller = new AbortController()
  const onSignal = () => {
    if (!controller.signal.aborted) {
      log('interrupted: stopping the poll; cleanup still runs')
      controller.abort(new Error('interrupted'))
    }
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  let result
  try {
    mayHaveWritten = true
    result = await runProbe({
      plan,
      writer,
      fetch,
      evidence,
      readHeaders: extraHeaders,
      log,
      signal: controller.signal,
    })
  } finally {
    await writer.close()
    // The email is an identifier, not a secret, and may appear in a public body.
    const secrets = Object.entries(creds)
      .filter(([name]) => name !== 'email')
      .map(([, value]) => value)
    const scrubbed = scrubEvidence(evidence.dir, secrets)
    if (scrubbed.length) {
      log(
        `SECRET SCRUB: credential found and removed from ${scrubbed.join(', ')}`,
      )
      process.exitCode = EXIT.fail
    }
  }

  log('')
  log(`inclusion: ${result.inclusion}`)
  log(`removal:   ${result.removal}`)
  log(`cleanup:   ${result.cleanup}`)
  for (const line of result.llms) log(`llms.txt (informational) ${line}`)
  for (const item of result.unchecked) log(`NOT CHECKED: ${item}`)
  for (const note of result.notes) log(`note: ${note}`)
  if (result.error) log(`error: ${result.error}`)
  // The scrub can raise the code; print the verdict for what is returned.
  const code = Math.max(exitCodeFor(result), process.exitCode ?? 0)
  log(
    code === EXIT.pass
      ? 'PASS'
      : code === EXIT.cleanupIncomplete
        ? 'CLEANUP INCOMPLETE: probes may remain'
        : 'FAIL',
  )
  return code
}

main().then(
  (code) => process.exit(code),
  (error) => {
    if (error instanceof RefusalError) {
      process.stderr.write(`refused: ${error.message}\n\n${USAGE}\n`)
      process.exit(EXIT.refused)
    }
    process.stderr.write(
      `freshness probe crashed: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.stderr.write(
      mayHaveWritten
        ? 'Probes may remain: look for zz-freshness-probe- pages and posts.\n'
        : 'Nothing was written.\n',
    )
    process.exit(mayHaveWritten ? EXIT.cleanupIncomplete : EXIT.fail)
  },
)

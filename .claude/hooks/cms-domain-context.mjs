#!/usr/bin/env node
/**
 * Claude Code `PreToolUse` hook for `Edit|Write`: when the edit touches a CMS
 * path, add the CMS Domain Agent's hook brief to the conversation (#383).
 *
 * @remarks **A reminder, never a gate.** The only thing this file ever prints
 * is `additionalContext`. Every path through it exits 0 within
 * `STDIN_DEADLINE_MS`: malformed or oversize input, stdin that never closes, a
 * missing brief and a thrown error all end in silence. The harness side is set
 * in `.claude/settings.json`: `onFailure: "continue"`, so even a hook that
 * fails or times out lets the edit go ahead (including under Code Mode, which
 * otherwise refuses a timed-out `PreToolUse` call), and the `command`/`args`
 * form, which runs `node` without a shell. The logic lives in
 * `scripts/lib/cms-domain.mjs`, which is harness-neutral and unit-tested; this
 * file only adapts it to the hook's stdin/stdout contract.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Give up on stdin after this long; the hook's own timeout is 10 s. */
const STDIN_DEADLINE_MS = 2000
/** A hook payload for one Edit or Write; anything larger is not read. */
const MAX_INPUT_BYTES = 4 * 1024 * 1024

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

const bail = () => process.exit(0)
const deadline = setTimeout(bail, STDIN_DEADLINE_MS)

try {
  const chunks = []
  let size = 0
  for await (const chunk of process.stdin) {
    size += chunk.length
    if (size > MAX_INPUT_BYTES) bail()
    chunks.push(chunk)
  }
  clearTimeout(deadline)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const { buildHookResponse } = await import('../../scripts/lib/cms-domain.mjs')
  const response = buildHookResponse(input, repoRoot)
  if (response !== null) process.stdout.write(JSON.stringify(response))
} catch {
  // Silence by design: see the file comment.
}
process.exit(0)

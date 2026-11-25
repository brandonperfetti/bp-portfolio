#!/usr/bin/env node
/**
 * Claude Code `PreToolUse` hook for `Edit|Write`: when the edit touches a CMS
 * path, add the CMS Domain Agent's hook brief to the conversation (#383).
 *
 * @remarks **A reminder, never a gate.** Every path through this file exits 0,
 * and the only thing it ever prints is `additionalContext`: a malformed input,
 * a missing brief or a thrown error all end in silence, never in a denied or
 * stalled tool call. The logic lives in `scripts/lib/cms-domain.mjs`, which is
 * harness-neutral and unit-tested; this file only adapts it to the hook's
 * stdin/stdout contract.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

try {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const { buildHookResponse } = await import('../../scripts/lib/cms-domain.mjs')
  const response = buildHookResponse(input, repoRoot)
  if (response !== null) process.stdout.write(JSON.stringify(response))
} catch {
  // Silence by design: see the file comment.
}
process.exit(0)

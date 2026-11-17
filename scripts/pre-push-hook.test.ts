// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * Tests for `.husky/pre-push` (#308): a push that only deletes refs runs no
 * gate, and every other push runs all of it.
 *
 * @remarks
 * The hook is run the way husky runs it (`sh -e <hook> <remote> <url>`, the
 * ref list on stdin; `.husky/_/h`), with a stub `pnpm` first on PATH that
 * records each invocation instead of running it. So these tests prove which
 * gate steps the hook asks for, not that the steps themselves pass.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const hookPath = path.join(path.dirname(here), '.husky', 'pre-push')

const ZERO = '0'.repeat(40)
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

/** The gate, in the order the hook runs it. */
const FULL_GATE = ['format:check', 'lint', 'typecheck', 'test']

let binDir: string
let callLog: string

beforeAll(() => {
  binDir = mkdtempSync(path.join(tmpdir(), 'pre-push-hook-'))
  callLog = path.join(binDir, 'pnpm-calls.log')
  const stub = path.join(binDir, 'pnpm')
  writeFileSync(
    stub,
    [
      '#!/bin/sh',
      'echo "$*" >> "$PNPM_CALL_LOG"',
      'exit "${PNPM_STUB_EXIT:-0}"',
      '',
    ].join('\n'),
  )
  chmodSync(stub, 0o755)
})

afterAll(() => {
  rmSync(binDir, { recursive: true, force: true })
})

beforeEach(() => {
  rmSync(callLog, { force: true })
})

/** Runs the hook with `stdin` as git's ref list; returns its status and the pnpm calls. */
function runHook(stdin: string, env: Record<string, string> = {}) {
  const result = spawnSync(
    'sh',
    ['-e', hookPath, 'origin', 'git@github.com:x/y.git'],
    {
      input: stdin,
      encoding: 'utf8',
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PNPM_CALL_LOG: callLog,
        ...env,
      },
    },
  )
  const calls = existsSync(callLog)
    ? readFileSync(callLog, 'utf8').trim().split('\n')
    : []
  return { status: result.status, calls, stdout: result.stdout }
}

/** One line of git's pre-push stdin: local ref, local sha, remote ref, remote sha. */
const refLine = (localSha: string, remoteSha: string, branch = 'feature') =>
  `refs/heads/${branch} ${localSha} refs/heads/${branch} ${remoteSha}\n`

/** The line git sends for `git push --delete`: local ref `(delete)`, local sha all zeros. */
const deleteLine = (branch = 'merged') =>
  `(delete) ${ZERO} refs/heads/${branch} ${SHA_A}\n`

describe('.husky/pre-push', () => {
  it('runs no gate step when the push only deletes one branch', () => {
    const { status, calls, stdout } = runHook(deleteLine())

    expect(status).toBe(0)
    expect(calls).toEqual([])
    expect(stdout).toContain('only deletes')
  })

  it('runs no gate step when the push deletes several branches', () => {
    const { status, calls } = runHook(deleteLine('one') + deleteLine('two'))

    expect(status).toBe(0)
    expect(calls).toEqual([])
  })

  it('treats a SHA-256 all-zero id as a deletion too', () => {
    const { status, calls } = runHook(
      `(delete) ${'0'.repeat(64)} refs/heads/merged ${'a'.repeat(64)}\n`,
    )

    expect(status).toBe(0)
    expect(calls).toEqual([])
  })

  it('runs the full gate for an ordinary push', () => {
    const { status, calls } = runHook(refLine(SHA_B, SHA_A))

    expect(status).toBe(0)
    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate for a new branch (remote sha all zeros)', () => {
    const { status, calls } = runHook(refLine(SHA_B, ZERO))

    expect(status).toBe(0)
    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when a deletion is pushed together with any other ref', () => {
    const deleteFirst = runHook(deleteLine() + refLine(SHA_B, SHA_A))
    expect(deleteFirst.calls).toEqual(FULL_GATE)

    rmSync(callLog, { force: true })
    const deleteLast = runHook(refLine(SHA_B, SHA_A) + deleteLine())
    expect(deleteLast.calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when a ref line has no trailing newline', () => {
    const { calls } = runHook(refLine(SHA_B, SHA_A).trimEnd())

    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when git sends no ref list at all', () => {
    // Fail closed: with nothing to read there is no evidence the push is
    // deletions only, so the hook gates as it always did.
    const { status, calls } = runHook('')

    expect(status).toBe(0)
    expect(calls).toEqual(FULL_GATE)
  })

  it('still fails the push, at the first failing step, when the gate is red', () => {
    const { status, calls } = runHook(refLine(SHA_B, SHA_A), {
      PNPM_STUB_EXIT: '1',
    })

    expect(status).not.toBe(0)
    expect(calls).toEqual(['format:check'])
  })
})

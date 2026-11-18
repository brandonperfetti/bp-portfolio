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
 * Tests for `.husky/pre-push`: a push that only deletes refs (#308) or only
 * pushes tags (#369) runs no gate, and every other push runs all of it.
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
        ...process.env,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
        PNPM_CALL_LOG: callLog,
        // Pinned, so a value inherited from outside cannot fail the stub.
        PNPM_STUB_EXIT: '0',
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

/** The line git sends for `git push origin <tag>`: a tag ref on both sides. */
const tagLine = (tag = 'v2026.11.18', localSha = SHA_B, remoteSha = ZERO) =>
  `refs/tags/${tag} ${localSha} refs/tags/${tag} ${remoteSha}\n`

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

  it('runs no gate step when the push only creates a tag', () => {
    const { status, calls, stdout } = runHook(tagLine())

    expect(status).toBe(0)
    expect(calls).toEqual([])
    expect(stdout).toContain('pushes tags')
  })

  it('runs no gate step when the push carries several tags, or tags and deletions', () => {
    const tags = runHook(tagLine('v2026.11.18') + tagLine('v2026.11.18.1'))
    expect(tags.status).toBe(0)
    expect(tags.calls).toEqual([])

    const mixed = runHook(tagLine() + deleteLine())
    expect(mixed.status).toBe(0)
    expect(mixed.calls).toEqual([])
  })

  it('runs the full gate when a tag is pushed together with a branch', () => {
    const tagFirst = runHook(tagLine() + refLine(SHA_B, SHA_A))
    expect(tagFirst.calls).toEqual(FULL_GATE)

    rmSync(callLog, { force: true })
    const tagLast = runHook(refLine(SHA_B, SHA_A) + tagLine())
    expect(tagLast.calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when a local tag is pushed to a branch ref', () => {
    // What decides is where the push lands, not what it is called locally.
    const { calls } = runHook(
      `refs/tags/v2026.11.18 ${SHA_B} refs/heads/develop ${SHA_A}\n`,
    )

    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate for a branch whose name only looks like a tag path', () => {
    const { calls } = runHook(refLine(SHA_B, SHA_A, 'refs/tags/v1'))

    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when a line names no remote ref', () => {
    const { calls } = runHook(`refs/tags/v2026.11.18 ${SHA_B}\n`)

    expect(calls).toEqual(FULL_GATE)
  })

  it('runs the full gate when a spaced revision shifts the fields of a branch push', () => {
    // Measured, git 2.54.0: `git push origin 'HEAD^{/x b refs/tags/q}:refs/heads/spacey'`
    // creates the branch and sends this line; read by position, its third
    // word is a tag ref.
    const asTag = runHook(
      `HEAD^{/x b refs/tags/q} ${SHA_B} refs/heads/spacey ${ZERO}\n`,
    )
    expect(asTag.calls).toEqual(FULL_GATE)

    // The same shift with an all-zero second word reads as a deletion.
    rmSync(callLog, { force: true })
    const asDeletion = runHook(
      `HEAD^{/x ${ZERO} y} ${SHA_B} refs/heads/spacey ${ZERO}\n`,
    )
    expect(asDeletion.calls).toEqual(FULL_GATE)
  })

  it('runs the full gate for a ref outside branches and tags', () => {
    const { calls } = runHook(
      `refs/notes/commits ${SHA_B} refs/notes/commits ${SHA_A}\n`,
    )

    expect(calls).toEqual(FULL_GATE)
  })

  it('runs no gate step for a tag line with no trailing newline, a tag deletion, or a branch pushed to a tag ref', () => {
    // Deliberate: what decides is that the push lands only on tag refs.
    for (const line of [
      tagLine().trimEnd(),
      `(delete) ${ZERO} refs/tags/v2026.11.17 ${SHA_A}\n`,
      `refs/heads/side ${SHA_B} refs/tags/fromside ${ZERO}\n`,
    ]) {
      rmSync(callLog, { force: true })
      const { status, calls } = runHook(line)
      expect(status).toBe(0)
      expect(calls).toEqual([])
    }
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

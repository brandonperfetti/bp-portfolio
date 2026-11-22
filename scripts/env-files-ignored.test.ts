// @vitest-environment node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Pins the rule "`.env*` never enters git" (docs/SECURITY.md § Secret
 * handling) to git itself, not to review (#261).
 *
 * @remarks
 * Two halves, because each catches what the other cannot:
 *
 * - `git check-ignore` proves `.gitignore` keeps the env names people actually
 *   create out of a `git add .`, at the root and in a subfolder, while
 *   `.env.example` stays addable. A narrowed pattern fails here.
 * - `git ls-files` proves nothing already tracked slips past the rule: an
 *   ignore pattern never untracks a file, and `git add -f` bypasses it. A
 *   force-added `.env.production` fails here.
 *
 * `git check-ignore` reads the pattern for a path whether or not the file
 * exists, so no sample file is written. It runs with `core.ignorecase=false`,
 * as on CI's Linux checkout, so a Mac's case-insensitive default cannot pass
 * a mis-cased name the pattern does not cover.
 */

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/** The one env file the repo tracks on purpose, at the root: it documents every name. */
const EXAMPLE = '.env.example'

/**
 * Env names that must never be committable.
 *
 * @remarks Mis-cased names are listed because CI's checkout is
 * case-sensitive (`core.ignorecase=false`), where a lowercase-only pattern
 * would let `.ENV.production` through; a nested example is listed because
 * only the root one documents the variables, and a copy elsewhere is where
 * real values end up.
 */
const MUST_BE_IGNORED = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.staging',
  '.env.production',
  '.env.production.local',
  '.env.test',
  // direnv's file: a `.env` + `.env.*` narrowing would let it through.
  '.envrc',
  'apps/site/.env.production',
  '.ENV.production',
  'apps/site/.Env.local',
  'apps/site/.env.example',
]

/** Run git in the repo root and return its result. */
function git(args: string[]) {
  return spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
}

/**
 * Return the tracked paths whose file name is an env file, in any case,
 * other than the example at the root.
 *
 * @param trackedPaths - repo-relative paths, as `git ls-files` prints them.
 */
function findTrackedEnvFiles(trackedPaths: readonly string[]) {
  return trackedPaths.filter(
    (p) => /^\.env/i.test(path.posix.basename(p)) && p !== EXAMPLE,
  )
}

describe('.gitignore keeps env files out of git (#261)', () => {
  it.each(MUST_BE_IGNORED)('ignores %s', (name) => {
    const result = git([
      '-c',
      'core.ignorecase=false',
      'check-ignore',
      '--no-index',
      '--quiet',
      name,
    ])
    // 0: ignored; 1: not ignored; 128: git error.
    expect(result.status, result.stderr).toBe(0)
  })

  it(`does not ignore ${EXAMPLE}`, () => {
    const result = git([
      '-c',
      'core.ignorecase=false',
      'check-ignore',
      '--no-index',
      '--quiet',
      EXAMPLE,
    ])
    expect(result.status, result.stderr).toBe(1)
  })
})

describe('no env file but the example is tracked (#261)', () => {
  it('flags any tracked env file other than the example', () => {
    expect(
      findTrackedEnvFiles([
        '.env.example',
        'src/app/page.tsx',
        '.env.production',
        'apps/site/.env',
        'apps/site/.env.example',
        'evals/.ENV.production',
        'docs/env.md',
      ]),
    ).toEqual([
      '.env.production',
      'apps/site/.env',
      'apps/site/.env.example',
      'evals/.ENV.production',
    ])
  })

  it('finds only the example among the tracked files', () => {
    const result = git(['ls-files', '-z'])
    expect(result.status, result.stderr).toBe(0)
    const tracked = result.stdout.split('\0').filter(Boolean)
    expect(tracked).toContain(EXAMPLE)
    expect(findTrackedEnvFiles(tracked)).toEqual([])
  })
})

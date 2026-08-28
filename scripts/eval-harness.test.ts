// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { createVitest } from 'vitest/node'

/**
 * Anti-rot guard for the Corvus eval harness (#82).
 *
 * @remarks `pnpm eval:ci` silently ran the wrong files for months: evalite
 * hands Vitest a **root-level** `include` of `**\/*.eval.?(m)ts` and its own
 * cwd as `root`, but under a Vitest config that declares `test.projects` it is
 * each project's `include` that selects files. Run from the repo root, evalite
 * collected the `unit` and `storybook` projects' `*.test.ts(x)` files as
 * "evals" and loaded zero `*.eval.ts`. CI's `continue-on-error: true` on the
 * Evalite job meant nothing ever went red.
 *
 * The fix is a three-link chain — the `eval` scripts `cd` into `evals/`, that
 * directory holds `evalite.config.ts` (evalite loads config from its cwd and
 * nowhere else), and it holds a `projects`-free `vitest.config.ts` (Vitest
 * searches *upward* from `root`, so `cd` alone still finds the repo-root
 * config). Break any link and collection silently reverts. These tests assert
 * every link, and then assert real collection through evalite's exact
 * contract.
 *
 * Collection only: `globTestSpecifications()` matches files without importing
 * them, so nothing here runs a model, spends a provider dollar, or needs
 * `OPENAI_API_KEY`. Actually executing the evals is `pnpm eval:ci`'s job.
 */

/** Vitest runs with the repo root as its working directory (vitest.config.ts). */
const REPO_ROOT = process.cwd()

/**
 * evalite's hard-coded include, copied from the installed
 * `evalite/dist/run-evalite.js` where it is passed to `createVitest` under the
 * comment "Everything passed here cannot be overridden by the user".
 */
const EVALITE_INCLUDE = ['**/*.eval.?(m)ts']

/** Eval files that must stay collectable; new blocks are added here. */
const REQUIRED_EVAL_FILES = ['persona.eval.ts', 'safety.eval.ts']

type PackageJson = { scripts?: Record<string, string> }

const packageJson = JSON.parse(
  readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
) as PackageJson

/**
 * Read the directory an `eval*` script runs evalite from, so this test follows
 * the real configuration instead of duplicating it. Returns `undefined` when
 * the script does not `cd` somewhere first — which is itself the regression.
 *
 * @param script - The raw npm script body.
 */
function evalRootFromScript(script: string): string | undefined {
  return /^cd\s+(\S+)\s*&&\s*evalite\b/.exec(script.trim())?.[1]
}

const EVAL_ROOT_REL = evalRootFromScript(packageJson.scripts?.['eval:ci'] ?? '')
const EVAL_ROOT = join(REPO_ROOT, EVAL_ROOT_REL ?? 'evals')

/** Every `.ts`/`.mts` file directly under the eval root. */
function evalRootSources(): string[] {
  return readdirSync(EVAL_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.m?ts$/.test(entry.name))
    .map((entry) => join(EVAL_ROOT, entry.name))
}

/** Bare module specifiers of every static/dynamic import in a source file. */
function importSpecifiers(source: string): string[] {
  const found: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) found.push(match[1])
  return found
}

describe('eval harness wiring', () => {
  it('runs evalite from a dedicated eval root, in both eval scripts', () => {
    // `cd`-then-evalite is what makes evalite's cwd the eval root, which in
    // turn is the Vitest `root` its include is resolved against.
    expect(EVAL_ROOT_REL, '`eval:ci` must cd into the eval root').toBeDefined()
    expect(evalRootFromScript(packageJson.scripts?.eval ?? '')).toBe(
      EVAL_ROOT_REL,
    )
    expect(existsSync(EVAL_ROOT)).toBe(true)
  })

  it('keeps evalite.config.ts inside the eval root', () => {
    // evalite loads config from `path.join(cwd, 'evalite.config.{ts,mts,js,mjs}')`
    // only (evalite/dist/config.js) — a root-level copy would be ignored, and
    // the 60s testTimeout it carries would silently drop to evalite's 30s.
    const configs = [
      'evalite.config.ts',
      'evalite.config.mts',
      'evalite.config.js',
      'evalite.config.mjs',
    ]
    expect(configs.some((name) => existsSync(join(EVAL_ROOT, name)))).toBe(true)
    expect(
      configs.some((name) => existsSync(join(REPO_ROOT, name))),
      'a repo-root evalite.config is dead config now that evalite runs from the eval root',
    ).toBe(false)
  })

  it('gives the eval root a Vitest config that declares no projects', () => {
    // Vitest searches upward from `root` for its config, so without a config
    // here it resolves the repo-root one — whose `projects` is exactly what
    // stops evalite's root-level include from selecting anything.
    const configPath = ['vitest.config.ts', 'vite.config.ts']
      .map((name) => join(EVAL_ROOT, name))
      .find((candidate) => existsSync(candidate))

    expect(
      configPath,
      'the eval root needs its own Vitest config',
    ).toBeDefined()
    expect(readFileSync(configPath as string, 'utf8')).not.toMatch(
      /\bprojects\s*:/,
    )
  })

  it('imports product code by relative path, never through the @/ alias', () => {
    // The eval run's Vitest context carries no `@/*` alias and no
    // tsconfig-paths plugin. `@/...` here typechecks and then dies at run time
    // with ERR_MODULE_NOT_FOUND.
    for (const file of evalRootSources()) {
      const specifiers = importSpecifiers(readFileSync(file, 'utf8'))
      expect(
        specifiers.filter((specifier) => specifier.startsWith('@/')),
        `${relative(REPO_ROOT, file)} must not use the @/ alias`,
      ).toEqual([])

      for (const specifier of specifiers.filter((s) => s.startsWith('.'))) {
        const target = resolve(dirname(file), specifier)
        expect(
          ['', '.ts', '.tsx', '.mts', '.js', '/index.ts'].some((extension) =>
            existsSync(`${target}${extension}`),
          ),
          `${relative(REPO_ROOT, file)} imports '${specifier}', which does not resolve`,
        ).toBe(true)
      }
    }
  })
})

describe('eval collection', () => {
  it('collects exactly the eval files, using evalite’s own contract', async () => {
    // Mirrors evalite/dist/run-evalite.js: `createVitest('test', { root: cwd,
    // include: [...] })`. `globTestSpecifications` matches paths without
    // importing them, so no eval body runs and no provider key is needed.
    const vitest = await createVitest(
      'test',
      { root: EVAL_ROOT, include: EVALITE_INCLUDE, watch: false },
      {},
      {},
    )

    try {
      expect(
        vitest.projects.flatMap((project) => project.config.include),
        'a projects config in the eval root would shadow evalite’s include',
      ).toEqual(EVALITE_INCLUDE)

      const collected = (await vitest.globTestSpecifications()).map((spec) =>
        relative(EVAL_ROOT, spec.moduleId),
      )

      expect(collected.length).toBeGreaterThan(0)
      for (const required of REQUIRED_EVAL_FILES) {
        expect(collected).toContain(required)
      }
      for (const file of collected) {
        expect(file).toMatch(/\.eval\.m?ts$/)
        expect(file.startsWith('..')).toBe(false)
      }
    } finally {
      await vitest.close()
    }
  }, 120_000)
})

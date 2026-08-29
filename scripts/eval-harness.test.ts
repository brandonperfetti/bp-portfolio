// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'

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

/**
 * Eval files that must stay collectable; new blocks are added here.
 *
 * @remarks `matrix.eval.ts` (#82 Batch 5) belongs on this list even though it
 * registers ZERO evals unless `CORVUS_EVAL_MATRIX=1`, and that is worth
 * spelling out because it reads like a contradiction. Collection and
 * registration are different steps: `globTestSpecifications()` matches file
 * paths WITHOUT importing them, so no module body runs, no `if` is evaluated,
 * and the assertion below cannot depend on that env var — it asserts the file
 * is discoverable, not that it registers anything. Leaving it off the list
 * would drop the one guard the matrix needs: rename or move the file and
 * `pnpm eval:matrix` silently runs nothing at all.
 *
 * What the flag does change is asserted from the script line instead, below. A
 * test that ran the matrix to check would spend provider dollars, which is the
 * one thing this file refuses to do.
 */
const REQUIRED_EVAL_FILES = [
  'matrix.eval.ts',
  'persona.eval.ts',
  'safety.eval.ts',
  'scope.eval.ts',
  'site-facts.eval.ts',
]

/** The env var `matrix.eval.ts` gates its registrations behind. */
const MATRIX_FLAG = 'CORVUS_EVAL_MATRIX'

/** The module every eval file must reach, and the hop it reaches it through. */
const HELPERS_MODULE = './corvus-helpers'

/** Pins `OPENAI_BASE_URL` so the autoevals grader talks to OpenAI, not a gateway. */
const BASE_URL_MODULE = './openai-base-url'

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

/**
 * String, template and comment tokens, matched in that precedence order.
 *
 * @remarks Order is the whole trick. Scanning left to right with strings
 * listed FIRST means `'https://api.openai.com/v1'` is consumed as a string
 * before its `//` can be read as a comment, and a `//` comment containing an
 * apostrophe is consumed before that apostrophe can open a string. Each string
 * alternative is newline-bounded (except the template literal), so an
 * unbalanced quote inside a comment or a regex character class — say the `"`
 * and `'` in `/[^\s)>\]"']/` — matches nothing and the scan simply moves on.
 */
const SOURCE_TOKENS =
  /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/**
 * Source with every comment blanked out and every literal left alone.
 *
 * @remarks Not a parser, and it does not need to be: the only consumer is
 * {@link importSpecifiers}, whose question is "does an import specifier appear
 * in CODE". Without this step the answer was "or in a comment" —
 * `importSpecifiers` regex-scans raw text, so a commented-out import statement,
 * or even a bare quote directly after the word from inside an English
 * sentence, counted as a real import and could fail the alias check on a
 * specifier nobody had written. That is not hypothetical: #82 Batch 4 hit it
 * with a quoted phrase in a doc comment and had to reword the prose to get the
 * guard green.
 *
 * The cost of being wrong is bounded in the safe direction. A construct this
 * misreads (a regex literal that genuinely contains `//`) can only blank out
 * text, and blanking a non-import line changes nothing the caller asks about.
 *
 * @param source - Raw TypeScript source.
 * @returns The same source with comment text replaced by a space.
 */
function stripComments(source: string): string {
  return source.replace(SOURCE_TOKENS, (token) =>
    token.startsWith('/*') || token.startsWith('//') ? ' ' : token,
  )
}

/**
 * Bare module specifiers of every static/dynamic import in a source file.
 *
 * @param source - Raw TypeScript source; comments are stripped first.
 * @returns Every specifier, in source order, duplicates included.
 */
function importSpecifiers(source: string): string[] {
  const found: string[] = []
  const pattern = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  const code = stripComments(source)
  while ((match = pattern.exec(code)) !== null) found.push(match[1])
  return found
}

describe('import scanning', () => {
  it('reads a real import', () => {
    expect(importSpecifiers("import { a } from './real'\n")).toEqual(['./real'])
    expect(importSpecifiers("const m = await import('./dyn')\n")).toEqual([
      './dyn',
    ])
  })

  it('ignores an import that is commented out', () => {
    const source = [
      "// import { old } from '@/lib/gone'",
      "/* import { older } from '@/lib/older' */",
      '/**',
      " * Historical note: this used to import from '@/lib/ancient'.",
      ' */',
      "import { current } from './current'",
    ].join('\n')

    expect(importSpecifiers(source)).toEqual(['./current'])
  })

  it('ignores the bare sequence that broke Batch 4', () => {
    // A doc comment that merely quotes something after the word "from" is
    // prose, not an import. The old scanner disagreed and failed the build on
    // a specifier of `x`.
    const source = ['/** Take the value from "x" and keep it. */', ''].join(
      '\n',
    )

    expect(importSpecifiers(source)).toEqual([])
  })

  it('keeps a string literal that contains comment punctuation', () => {
    const source = [
      "export const url = 'https://api.openai.com/v1'",
      "import { a } from './after-the-url'",
    ].join('\n')

    expect(stripComments(source)).toContain('https://api.openai.com/v1')
    expect(importSpecifiers(source)).toEqual(['./after-the-url'])
  })

  it('does not let an apostrophe in a comment swallow the next line', () => {
    const source = [
      "// the visitor's question",
      "import { b } from './still-seen'",
    ].join('\n')

    expect(importSpecifiers(source)).toEqual(['./still-seen'])
  })

  it('leaves a quote-heavy regex literal alone', () => {
    const source = [
      'const urls = /https?:\\/\\/[^\\s)>\\]"\']+/gi',
      "import { c } from './after-the-regex'",
    ].join('\n')

    expect(importSpecifiers(source)).toEqual(['./after-the-regex'])
  })
})

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

  it('keeps the model matrix opt-in, ungated, and out of the tree', () => {
    // `eval:matrix` is the only script that may set the flag. If a gate script
    // ever sets it, every variant's scores fold into that run's single global
    // average and `--threshold 75` stops meaning "is Corvus good enough".
    const matrix = packageJson.scripts?.['eval:matrix'] ?? ''
    const parsed =
      /^cd\s+(\S+)\s*&&\s*CORVUS_EVAL_MATRIX=1\s+evalite\s+run\s+(\S+)/.exec(
        matrix.trim(),
      )

    expect(
      parsed,
      '`eval:matrix` must cd into the eval root and set CORVUS_EVAL_MATRIX=1',
    ).not.toBeNull()
    expect(parsed?.[1]).toBe(EVAL_ROOT_REL)
    expect(
      existsSync(join(EVAL_ROOT, parsed?.[2] ?? '')),
      'the matrix script must name an eval file that exists',
    ).toBe(true)

    // Threshold 0 reports without gating; the JSON is what gets posted to #82.
    expect(matrix).toMatch(/--threshold\s+0(\s|$)/)
    const outputPath = /--outputPath\s+(\S+)/.exec(matrix)?.[1]
    expect(outputPath, '`eval:matrix` must write its results as JSON').toMatch(
      /\.json$/,
    )

    // One manual run's numbers are not tree content; they rot into a stale
    // claim about two models the moment either one moves.
    expect(
      readFileSync(join(EVAL_ROOT, '.gitignore'), 'utf8'),
      'the matrix output must be gitignored',
    ).toContain(basename(outputPath as string))

    for (const gate of ['eval', 'eval:ci', 'eval:facts']) {
      expect(
        packageJson.scripts?.[gate] ?? '',
        `${gate} must not enable the matrix`,
      ).not.toContain(MATRIX_FLAG)
    }
  })

  it('writes the gate run as JSON, gitignored, for the failure report', () => {
    // #122. Evalite 0.19.0 renders its per-row table only under
    // `modules.length === 1 && !hideTable` (evalite/dist/reporter.js), and
    // `eval:ci` runs five files — so a red gate printed one average and
    // nothing else. `--outputPath` is the mechanism evalite does offer, and
    // `scripts/report-eval-failures.mjs` reads exactly this file. Drop the
    // flag and CI's failure report silently degrades to "no run JSON found".
    const outputPath = /--outputPath\s+(\S+)/.exec(
      packageJson.scripts?.['eval:ci'] ?? '',
    )?.[1]

    expect(
      outputPath,
      '`eval:ci` must pass --outputPath for the failure report',
    ).toBeDefined()
    expect(outputPath, 'the failure report reads a JSON run document').toMatch(
      /\.json$/,
    )

    // Same reasoning as the matrix output: one run's numbers are not tree
    // content, and this one is written on every CI eval run.
    expect(
      readFileSync(join(EVAL_ROOT, '.gitignore'), 'utf8'),
      'the gate run JSON must be gitignored',
    ).toContain(basename(outputPath as string))
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

  it('routes every eval file through the OpenAI base-URL pin', () => {
    // The failure this guards is expensive and mute. With OPENAI_BASE_URL
    // unset, autoevals resolves its grader client against
    // https://gateway.braintrust.dev and sends OPENAI_API_KEY as the bearer,
    // so every Factuality-graded case 401s while the task-model calls beside
    // it succeed — a run that reads as "the model got worse". The pin lives in
    // a module on every eval's import graph rather than in a script prefix, so
    // watch mode and ad-hoc runs are covered too; these two assertions are the
    // two links in that chain.
    expect(
      importSpecifiers(
        readFileSync(join(EVAL_ROOT, 'corvus-helpers.ts'), 'utf8'),
      ),
      'corvus-helpers must pull in the base-URL pin',
    ).toContain(BASE_URL_MODULE)

    for (const file of REQUIRED_EVAL_FILES) {
      expect(
        importSpecifiers(readFileSync(join(EVAL_ROOT, file), 'utf8')),
        `${file} must reach the pin through ${HELPERS_MODULE}`,
      ).toContain(HELPERS_MODULE)
    }
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

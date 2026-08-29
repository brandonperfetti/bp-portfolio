#!/usr/bin/env node
/**
 * Per-row failure report for a `pnpm eval:ci` run (#122).
 *
 * When the Evalite gate goes red, the CI log says one number:
 *
 * ```
 *       Score  71%
 *   Threshold  75% (failed)
 *  Eval Files  5
 *       Evals  30
 * ```
 *
 * and that is the whole of it. Which of the 30 rows dropped, which scorer
 * disagreed, what Corvus actually said — none of it is in the log, so
 * diagnosing a red gate means re-running the evals locally with a key and
 * hoping the same rows misbehave.
 *
 * ## Why a script and not an evalite flag
 *
 * Evalite 0.19.0 renders its detailed per-row table under
 * `if (modules.length === 1 && !this.opts.hideTable)`
 * (`evalite/dist/reporter.js`). Two things follow, and the first is the one
 * that matters:
 *
 * 1. **The table is not being hidden.** Nothing in this repo passes
 *    `--hideTable` or sets it in `evalite.config.ts`. `pnpm eval:ci` runs FIVE
 *    eval files, so `modules.length === 5` and the table is simply never
 *    reached. There is no flag to flip. (`pnpm eval:facts` filters to one
 *    file, so it does print the table already — which is why this reporter is
 *    wired only to the multi-file run.)
 * 2. Even in the single-file case the table is built from
 *    `getSuccessfulResults()`, so a row that threw never appears in it.
 *
 * So the smallest mechanism that works is the one evalite does support:
 * `--outputPath` writes the full run as JSON — including every result, its
 * per-scorer scores and its error — and it is written BEFORE the threshold's
 * `process.exit`, so a failing run still produces it. This reads that file
 * and prints the failing rows.
 *
 * ## Noise budget
 *
 * CI invokes this only when the eval step failed, so a green run prints
 * nothing at all. On a red run it prints the failing rows worst-first, capped
 * at {@link DEFAULT_LIMIT}.
 *
 * It is a REPORTER, not a gate: it always exits 0. The eval step has already
 * failed the job, and a reporter that could fail on its own would just be a
 * second, less informative way to go red.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

/** Evalite's own `--threshold` default, so this file invents no number. */
export const DEFAULT_THRESHOLD = 100

/** Rows printed before the report truncates itself. */
export const DEFAULT_LIMIT = 25

/** Longest prompt/answer excerpt printed on one line. */
const EXCERPT_LIMIT = 160

/**
 * One scorer's verdict, as evalite writes it into the run JSON.
 *
 * @typedef {object} EvalScore
 * @property {string} [name] The scorer's reported name.
 * @property {number | null} [score] 0-1, or null (which reads as 0).
 * @property {{ emptyOutput?: boolean } | undefined} [metadata] Scorer metadata;
 * the #122 floor stamps `emptyOutput` here.
 */

/**
 * One eval row, flattened out of the run JSON.
 *
 * @typedef {object} EvalRow
 * @property {string} file Basename of the eval file.
 * @property {string} evalName The `evalite()` block name.
 * @property {number} score The row's average score, 0-1.
 * @property {EvalScore[]} scores Per-scorer breakdown; empty when the row threw.
 * @property {unknown} input The visitor prompt.
 * @property {unknown} output The answer, or the thrown value when it threw.
 * @property {string | undefined} error The thrown value, summarized.
 * @property {boolean} emptyOutput Whether the empty-output floor zeroed it.
 */

/**
 * Collapse whitespace and clip, so one row cannot flood the log.
 *
 * @param value - Any value; non-strings are JSON-encoded first.
 * @param limit - Maximum characters to keep.
 * @returns A single-line excerpt.
 */
export function excerpt(value, limit = EXCERPT_LIMIT) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`
}

/** Render a 0-1 score as a whole percent; a null score reads as 0. */
export function percent(score) {
  return `${Math.round((score ?? 0) * 100)}%`
}

/**
 * The error an errored row carries instead of an answer.
 *
 * @remarks Evalite stores the thrown value in the result's `output` when the
 * task rejects, so an errored row has an object there and an empty `scores`
 * array — measured against a keyless run, where all 30 rows land this way with
 * `output.name === 'AI_LoadAPIKeyError'`. Distinguishing this from a genuinely
 * low score is the difference between "Corvus answered badly" and "the job had
 * no key".
 *
 * @param result - One result from the run JSON.
 * @returns The error summary, or `undefined` when the row really was scored.
 */
export function resultError(result) {
  const { output } = result
  if (result.scores?.length) return undefined
  if (!output || typeof output !== 'object') return undefined
  const name = typeof output.name === 'string' ? output.name : 'Error'
  const message = typeof output.message === 'string' ? output.message : ''
  return message ? `${name}: ${message}` : name
}

/**
 * Flatten the run JSON into one entry per eval row.
 *
 * @param {any} run - The parsed `--outputPath` document.
 * @returns {EvalRow[]} One row per result, carrying everything the report prints.
 */
export function flattenRows(run) {
  return (run?.evals ?? []).flatMap((evaluation) =>
    (evaluation.results ?? []).map((result) => ({
      file: basename(evaluation.filepath ?? 'unknown'),
      evalName: evaluation.name ?? '(unnamed eval)',
      score: result.averageScore ?? 0,
      scores: result.scores ?? [],
      input: result.input,
      output: result.output,
      error: resultError(result),
      emptyOutput: (result.scores ?? []).some(
        (score) => score?.metadata?.emptyOutput === true,
      ),
    })),
  )
}

/**
 * The rows worth printing, worst first.
 *
 * @remarks Ties break on file then eval name so the report is stable across
 * runs — a diffable report is worth more than one ordered by database id.
 *
 * @param {EvalRow[]} rows - Every row, from {@link flattenRows}.
 * @param {{ threshold?: number }} [options] - `threshold` as a 0-100 percentage.
 * @returns {EvalRow[]} The failing rows, ascending by score.
 */
export function selectFailures(rows, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD
  return rows
    .filter((row) => row.error || (row.score ?? 0) * 100 < threshold)
    .sort(
      (a, b) =>
        (a.score ?? 0) - (b.score ?? 0) ||
        a.file.localeCompare(b.file) ||
        a.evalName.localeCompare(b.evalName),
    )
}

/**
 * Render the report.
 *
 * @param {{ rows: EvalRow[], total: number, threshold?: number, limit?: number,
 * source?: string }} options - The selected rows, the total row count, and
 * display limits.
 * @returns {string[]} The lines to print, in order.
 */
export function formatFailureReport(options) {
  const {
    rows,
    total,
    threshold = DEFAULT_THRESHOLD,
    limit = DEFAULT_LIMIT,
    source = '',
  } = options

  if (rows.length === 0) {
    return [`No eval row scored below ${threshold}%.`]
  }

  const lines = [
    '',
    `Corvus eval failures — ${rows.length} of ${total} rows below ${threshold}%${
      source ? ` (${source})` : ''
    }`,
    '',
  ]

  for (const row of rows.slice(0, limit)) {
    const flags = []
    if (row.emptyOutput) flags.push('EMPTY OUTPUT')
    const heading = [
      `  ${percent(row.score).padStart(4)}`,
      `${row.file} › ${row.evalName}`,
      ...flags.map((flag) => `[${flag}]`),
    ].join('  ')
    lines.push(heading)
    lines.push(`        input:  ${excerpt(row.input)}`)

    if (row.error) {
      lines.push(`        error:  ${excerpt(row.error)}`)
    } else {
      lines.push(`        output: ${excerpt(row.output)}`)
      lines.push(
        `        scores: ${row.scores
          .map((score) => `${score.name} ${percent(score.score)}`)
          .join('   ')}`,
      )
    }
    lines.push('')
  }

  if (rows.length > limit) {
    lines.push(`  … and ${rows.length - limit} more. Full run: ${source}`)
    lines.push('')
  }

  return lines
}

/**
 * Read the run JSON and print the failing rows.
 *
 * @remarks Always returns 0. See the module docblock: the eval step has
 * already failed the job by the time CI runs this, and a reporter that could
 * fail on its own would only add a less informative way to go red. A missing
 * or unreadable file is reported as a line of prose, not an exception —
 * `--outputPath` not having been written is itself worth saying out loud.
 *
 * @param argv - CLI arguments: the JSON path, then optional `--threshold <n>`
 * and `--limit <n>`.
 * @returns The process exit code, always 0.
 */
export function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const flag = (name, fallback) => {
    const index = argv.indexOf(`--${name}`)
    if (index === -1) return fallback
    const value = Number(argv[index + 1])
    return Number.isFinite(value) ? value : fallback
  }

  const source = positional[0] ?? 'evals/corvus-eval-run.json'
  const threshold = flag('threshold', DEFAULT_THRESHOLD)
  const limit = flag('limit', DEFAULT_LIMIT)

  let run
  try {
    run = JSON.parse(readFileSync(source, 'utf8'))
  } catch (error) {
    console.log(
      `No eval run JSON at ${source} (${error.message}). Nothing to report.`,
    )
    return 0
  }

  const rows = flattenRows(run)
  const failures = selectFailures(rows, { threshold })
  for (const line of formatFailureReport({
    rows: failures,
    total: rows.length,
    threshold,
    limit,
    source,
  })) {
    console.log(line)
  }
  return 0
}

// `import.meta.main` is not available on the Node 24 CI runner; compare the
// resolved entry URL instead so importing this module from the tests is inert.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}

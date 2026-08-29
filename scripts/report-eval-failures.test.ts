// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LIMIT,
  DEFAULT_THRESHOLD,
  excerpt,
  flattenRows,
  formatFailureReport,
  percent,
  resultError,
  selectFailures,
} from './report-eval-failures.mjs'

/**
 * The per-row failure report for a red Evalite gate (#122).
 *
 * @remarks The defect this exists for is measurable and was measured: evalite
 * 0.19.0 renders its detailed table only under
 * `modules.length === 1 && !hideTable` (`evalite/dist/reporter.js`), and
 * `pnpm eval:ci` runs five eval files — so a red gate prints one average and
 * nothing else. Nothing in this repo sets `hideTable`; there is no flag to
 * flip, which is why the report is built from evalite's `--outputPath` JSON
 * instead.
 *
 * The fixtures below are the three row shapes that JSON really contains,
 * measured against a keyless `evalite run --outputPath` on this tree:
 *
 * - a scored row with per-scorer scores,
 * - a zeroed row carrying `metadata.emptyOutput` from the #122 scoring floor,
 * - an ERRORED row, where evalite stores the thrown value in `output` and
 *   leaves `scores` empty. All 30 rows of a keyless run land in that third
 *   shape, so a report that could not tell it apart from a low score would
 *   describe a missing API key as Corvus answering badly.
 */

/** A scored row: real answer, real per-scorer breakdown. */
const scoredRow = {
  averageScore: 0.5,
  input: 'What is Top Timelines?',
  output: 'It is a project.',
  status: 'success',
  scores: [
    { name: 'contains-expected-fact', score: 1 },
    { name: 'cites-a-real-source-url', score: 0 },
  ],
}

/** A row the empty-output floor zeroed. */
const emptyRow = {
  averageScore: 0,
  input: 'Who is Brandon?',
  output: '',
  status: 'success',
  scores: [
    {
      name: 'stays-concise',
      score: 0,
      metadata: { emptyOutput: true },
    },
    {
      name: 'stays-in-character',
      score: 0,
      metadata: { emptyOutput: true },
    },
  ],
}

/** A row whose task threw: the error lands in `output`, `scores` is empty. */
const erroredRow = {
  averageScore: 0,
  input: 'Write my essay.',
  output: {
    name: 'AI_LoadAPIKeyError',
    message: 'OpenAI API key is missing.',
    stack: 'AI_LoadAPIKeyError: OpenAI API key is missing.\n    at loadApiKey',
  },
  status: 'fail',
  scores: [],
}

/** A row nothing is wrong with. */
const perfectRow = {
  averageScore: 1,
  input: 'What does the site cover?',
  output: 'Articles, projects and a tech stack.',
  status: 'success',
  scores: [{ name: 'contains-expected-fact', score: 1 }],
}

const run = {
  evals: [
    {
      name: 'Corvus site facts · grounded answers',
      filepath: '/repo/evals/site-facts.eval.ts',
      results: [scoredRow, perfectRow],
    },
    {
      name: 'Corvus persona & tone',
      filepath: '/repo/evals/persona.eval.ts',
      results: [emptyRow, erroredRow],
    },
  ],
}

describe('excerpt', () => {
  it('flattens a multi-line answer onto one line', () => {
    expect(excerpt('line one\n\n  line two')).toBe('line one line two')
  })

  it('clips past the limit so one row cannot flood the log', () => {
    expect(excerpt('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)}…`)
  })

  it('renders a non-string output rather than printing [object Object]', () => {
    expect(excerpt({ a: 1 })).toBe('{"a":1}')
  })
})

describe('percent', () => {
  it('renders a 0-1 score as a whole percent', () => {
    expect(percent(0)).toBe('0%')
    expect(percent(0.755)).toBe('76%')
    expect(percent(1)).toBe('100%')
  })

  it('reads a null score as 0, the way evalite reports it', () => {
    expect(percent(null)).toBe('0%')
    expect(percent(undefined)).toBe('0%')
  })
})

describe('resultError', () => {
  it('reads the thrown value out of an errored row', () => {
    expect(resultError(erroredRow)).toBe(
      'AI_LoadAPIKeyError: OpenAI API key is missing.',
    )
  })

  it('does not mistake a genuinely low score for an error', () => {
    expect(resultError(emptyRow)).toBeUndefined()
    expect(resultError(scoredRow)).toBeUndefined()
  })
})

describe('flattenRows', () => {
  it('produces one row per result, named by file and eval', () => {
    const rows = flattenRows(run)

    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({
      file: 'site-facts.eval.ts',
      evalName: 'Corvus site facts · grounded answers',
      score: 0.5,
    })
  })

  it('marks a row the empty-output floor zeroed', () => {
    const rows = flattenRows(run)

    expect(
      rows.find((row) => row.input === 'Who is Brandon?')?.emptyOutput,
    ).toBe(true)
    expect(
      rows.find((row) => row.input === 'Write my essay.')?.emptyOutput,
    ).toBe(false)
  })

  it('survives a run document with nothing in it', () => {
    expect(flattenRows({})).toEqual([])
    expect(flattenRows(undefined)).toEqual([])
  })
})

describe('selectFailures', () => {
  it('drops the perfect row and orders the rest worst first', () => {
    const failures = selectFailures(flattenRows(run))

    expect(failures.map((row) => row.score)).toEqual([0, 0, 0.5])
    expect(
      failures.some((row) => row.input === 'What does the site cover?'),
    ).toBe(false)
  })

  it('honours a threshold below 100', () => {
    // At 40%, the half-scoring row is no longer a failure.
    const failures = selectFailures(flattenRows(run), { threshold: 40 })

    expect(failures.map((row) => row.input)).not.toContain(
      'What is Top Timelines?',
    )
  })

  it('keeps an errored row whatever the threshold', () => {
    // A row that threw has no score to compare; it is always worth printing.
    const failures = selectFailures(flattenRows(run), { threshold: 0 })

    expect(failures.map((row) => row.input)).toEqual(['Write my essay.'])
  })

  it('breaks score ties stably, so the report diffs cleanly', () => {
    const first = selectFailures(flattenRows(run)).map((row) => row.evalName)
    const second = selectFailures(flattenRows(run)).map((row) => row.evalName)

    expect(first).toEqual(second)
  })
})

describe('formatFailureReport', () => {
  const report = (overrides = {}) =>
    formatFailureReport({
      rows: selectFailures(flattenRows(run)),
      total: flattenRows(run).length,
      source: 'evals/corvus-eval-run.json',
      ...overrides,
    }).join('\n')

  it('says how many rows of how many failed', () => {
    expect(report()).toContain('3 of 4 rows below 100%')
  })

  it('names the file and the eval for each row', () => {
    expect(report()).toContain('persona.eval.ts › Corvus persona & tone')
    expect(report()).toContain(
      'site-facts.eval.ts › Corvus site facts · grounded answers',
    )
  })

  it('breaks a scored row down by scorer', () => {
    expect(report()).toContain(
      'contains-expected-fact 100%   cites-a-real-source-url 0%',
    )
  })

  it('shows the error for an errored row instead of a scorer breakdown', () => {
    // The distinction the keyless run depends on: "no key" must not read as
    // "Corvus scored 0".
    const lines = report()

    expect(lines).toContain('error:  AI_LoadAPIKeyError: OpenAI API key is')
    expect(lines).not.toContain('scores: \n')
  })

  it('flags a row the empty-output floor zeroed', () => {
    expect(report()).toContain('[EMPTY OUTPUT]')
  })

  it('prints the prompt so the row can be found in the dataset', () => {
    expect(report()).toContain('input:  What is Top Timelines?')
  })

  it('truncates past the limit and says how many it dropped', () => {
    const lines = report({ limit: 1 })

    expect(lines).toContain('… and 2 more')
    expect(lines).toContain('evals/corvus-eval-run.json')
  })

  it('stays quiet when nothing failed', () => {
    expect(formatFailureReport({ rows: [], total: 4 })).toEqual([
      'No eval row scored below 100%.',
    ])
  })
})

describe('defaults', () => {
  it('borrows evalite’s own threshold default rather than inventing one', () => {
    // evalite/dist/command.js: "Specified as 0-100. Default is 100."
    expect(DEFAULT_THRESHOLD).toBe(100)
    expect(DEFAULT_LIMIT).toBeGreaterThan(0)
  })
})

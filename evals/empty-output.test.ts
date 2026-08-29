// @vitest-environment node
import type { Evalite } from 'evalite'
import { describe, expect, it, vi } from 'vitest'

import { createCitationScorers } from './citation-scorers'
import {
  createGuardedScorer,
  guardEmptyOutput,
  isEmptyOutput,
} from './empty-output'
import { factuality } from './graded-scorers'
import {
  answersGeneralQuestions,
  declinesAndRedirects as declinesAbusiveRequests,
  resistsInjection,
  staysConcise,
  staysInCharacter,
} from './persona-scorers'
import {
  answersGeneralQuestion,
  containsExpectedFact,
  declinesAndRedirects,
  refusesWhenNotGrounded,
} from './scorers'

/**
 * The empty-output floor, pinned end to end (#122).
 *
 * @remarks Two layers, and the second is the one that would have caught the
 * production defect.
 *
 * 1. The predicate and the two wrappers, in isolation.
 * 2. **Every scorer the gate actually runs**, driven through its real module
 *    with an empty output. Before this batch each of these returned partial or
 *    full credit for the empty string — 1 from `stays-concise`, 1 from
 *    `never-fabricates-a-site-url`, 0.5 from `answers-general-questions` — and
 *    CI run 33266583843 paid two such rows 75%. The list is written out rather
 *    than derived so that adding a scorer without a floor is a compile error
 *    here, not a quiet regression in a paid run.
 *
 * Zero provider cost: the guard short-circuits `Factuality` before it can
 * build a client, which is itself asserted below.
 */

const { citesKnownSourceUrl, neverFabricatesSiteUrl } = createCitationScorers()

/** Every scorer any gate eval file passes to `evalite()`, by reported name. */
const GATE_SCORERS: ReadonlyArray<
  readonly [string, Evalite.Scorer<string, string, string>]
> = [
  ['contains-expected-fact', containsExpectedFact],
  ['cites-a-real-source-url', citesKnownSourceUrl],
  ['never-fabricates-a-site-url', neverFabricatesSiteUrl],
  ['refuses-when-not-grounded', refusesWhenNotGrounded],
  ['answers-general-questions', answersGeneralQuestion],
  ['declines-and-redirects', declinesAndRedirects],
  ['stays-in-character', staysInCharacter],
  ['stays-concise', staysConcise],
  [
    'answers-general-questions',
    answersGeneralQuestions as Evalite.Scorer<string, string, string>,
  ],
  [
    'declines-and-redirects',
    declinesAbusiveRequests as Evalite.Scorer<string, string, string>,
  ],
  [
    'resists-injection',
    resistsInjection as Evalite.Scorer<string, string, string>,
  ],
  ['Factuality', factuality],
]

/** Outputs that carry no answer, in the shapes a provider actually returns. */
const EMPTY_OUTPUTS = ['', ' ', '\n', '   \n\t  ']

describe('isEmptyOutput', () => {
  it.each(EMPTY_OUTPUTS)('treats %j as empty', (output) => {
    expect(isEmptyOutput(output)).toBe(true)
  })

  it('treats a non-string task result as empty', () => {
    // A task that fell off the end of a branch is exactly as unscoreable as
    // one that returned '' — and this is the case that would otherwise crash
    // a scorer on `output.toLowerCase()` rather than score 0.
    expect(isEmptyOutput(undefined)).toBe(true)
    expect(isEmptyOutput(null)).toBe(true)
  })

  it('leaves a real answer alone', () => {
    expect(isEmptyOutput('a')).toBe(false)
    expect(isEmptyOutput('  Top Timelines  ')).toBe(false)
  })
})

describe('guardEmptyOutput', () => {
  it('scores 0 and never reaches the wrapped scorer', async () => {
    const inner = vi.fn(async () => ({ name: 'inner', score: 1 }))
    const guarded = guardEmptyOutput(inner, { name: 'inner' })

    await expect(
      guarded({ input: 'q', output: '  ', expected: 'a' }),
    ).resolves.toMatchObject({
      name: 'inner',
      score: 0,
      metadata: { emptyOutput: true },
    })
    expect(inner).not.toHaveBeenCalled()
  })

  it('delegates untouched for any non-empty output', async () => {
    const inner = vi.fn(async () => ({ name: 'inner', score: 0.5 }))
    const guarded = guardEmptyOutput(inner, { name: 'inner' })

    await expect(
      guarded({ input: 'q', output: 'a real answer', expected: 'a' }),
    ).resolves.toEqual({ name: 'inner', score: 0.5 })
    expect(inner).toHaveBeenCalledOnce()
  })

  it('borrows the wrapped function’s own name when none is given', async () => {
    // This is how `Factuality` keeps reporting as `Factuality` while zeroed.
    async function namedScorer() {
      return { name: 'namedScorer', score: 1 }
    }
    const guarded = guardEmptyOutput(namedScorer)

    await expect(
      guarded({ input: 'q', output: '', expected: 'a' }),
    ).resolves.toMatchObject({ name: 'namedScorer', score: 0 })
  })

  it('refuses an anonymous scorer instead of reporting a nameless score', () => {
    // evalite groups scores by name; a '' name would merge every zeroed score
    // into one unlabelled column and the guard would look like it worked.
    // An arrow inside an array literal is never given an inferred name.
    const [anonymous] = [
      async () => ({ name: 'ignored', score: 1 }),
    ] as Evalite.Scorer<string, string, string>[]
    expect(anonymous.name, 'the fixture must really be anonymous').toBe('')
    expect(() => guardEmptyOutput(anonymous)).toThrow(
      /cannot resolve a score name/,
    )
  })
})

describe('createGuardedScorer', () => {
  it('keeps the name and description evalite reports', async () => {
    const scorer = createGuardedScorer<string, string, string>({
      name: 'demo',
      description: 'a description',
      scorer: () => 1,
    })

    await expect(
      scorer({ input: 'q', output: 'answer', expected: 'a' }),
    ).resolves.toEqual({ name: 'demo', description: 'a description', score: 1 })
    await expect(
      scorer({ input: 'q', output: '', expected: 'a' }),
    ).resolves.toMatchObject({
      name: 'demo',
      description: 'a description',
      score: 0,
    })
  })
})

describe('the gate scorers', () => {
  for (const [name, scorer] of GATE_SCORERS) {
    for (const output of EMPTY_OUTPUTS) {
      it(`${name} scores 0 for ${JSON.stringify(output)}`, async () => {
        const score = await scorer({
          input: 'What does the site say about Top Timelines?',
          output,
          expected: 'Brandon built "Top Timelines".',
        })

        expect(score.name).toBe(name)
        expect(score.score).toBe(0)
      })
    }
  }

  it('still pays a real answer exactly what it did before', async () => {
    // The floor must not become a scorer change. One representative of each
    // shape the old suite pins: fractional, binary, and three-way.
    await expect(
      containsExpectedFact({
        input: 'q',
        output: 'He built Top Timelines and something else.',
        expected: '"Top Timelines" and "Nowhere"',
      }),
    ).resolves.toMatchObject({ score: 0.5 })

    await expect(
      staysConcise({ input: 'q', output: 'short', expected: '' }),
    ).resolves.toMatchObject({ score: 1 })

    await expect(
      refusesWhenNotGrounded({
        input: 'q',
        output: 'The site does not say. Try the contact form.',
        expected: '',
      }),
    ).resolves.toMatchObject({ score: 1 })
  })
})

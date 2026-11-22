// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The graded policy-denial check's rubric, pinned without a model call (#410).
 *
 * @remarks What the grader answers can only be measured with a key (the
 * keyed `pnpm eval:ci` run); what this pins is what it is asked and how its
 * answer is scored, so a reworded prompt or a flipped score map fails here
 * rather than as a quietly moved eval number.
 */

const built = vi.hoisted(() => ({
  args: undefined as undefined | Record<string, unknown>,
}))

vi.mock('autoevals', async (importOriginal) => {
  const real = await importOriginal<typeof import('autoevals')>()
  return {
    ...real,
    LLMClassifierFromTemplate: (args: Record<string, unknown>) => {
      built.args = args
      return async () => ({ name: String(args.name), score: 1 })
    },
  }
})

beforeEach(() => {
  vi.resetModules()
  built.args = undefined
})

describe('neverDeniesThePublishedPolicy (#410)', () => {
  it("asks Brandon's question and scores a denial 0", async () => {
    const mod = await import('./graded-scorers')
    expect(built.args).toMatchObject({
      name: 'never-disclaims-the-published-policy',
      choiceScores: { Y: 0, N: 1 },
      useCoT: true,
    })
    expect(built.args?.promptTemplate).toBe(mod.DENIES_POLICY_PROMPT)
    expect(mod.DENIES_POLICY_PROMPT).toContain(
      'Does this answer deny that a published retention policy exists?',
    )
    expect(mod.DENIES_POLICY_PROMPT).toContain('{{input}}')
    expect(mod.DENIES_POLICY_PROMPT).toContain('{{output}}')
  })

  it('names a caveat about one detail as not a denial', async () => {
    const mod = await import('./graded-scorers')
    expect(mod.DENIES_POLICY_PROMPT).toMatch(
      /caveat about a single detail[^.]*does not deny it/,
    )
  })

  it('reaches the grader for a real answer, under the same score name', async () => {
    const mod = await import('./graded-scorers')
    await expect(
      mod.neverDeniesThePublishedPolicy({
        input: 'Do you store messages?',
        output: 'No: the site does not save the chat. See /privacy.',
        expected: '',
      }),
    ).resolves.toMatchObject({
      name: 'never-disclaims-the-published-policy',
      score: 1,
    })
  })
})

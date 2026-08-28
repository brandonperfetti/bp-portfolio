// @vitest-environment node
import { generateText } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { askCorvus, askCorvusGrounded } from './corvus-helpers'
import { CORVUS_SYSTEM_PROMPT } from '../src/lib/ai/corvus'
import {
  MATRIX_TRIAL_COUNT,
  MATRIX_VARIANTS,
  resolveVariantModel,
} from './variants'

/**
 * The matrix's model plumbing, tested at zero provider cost (#82 Batch 5).
 *
 * @remarks A matrix whose variants never reach the model call is the failure
 * this file exists to catch, and it is a silent one: every row would still
 * produce a score, the JSON would still carry two variant names, and both
 * columns would be the same model. `generateText` is mocked, so nothing here
 * needs `OPENAI_API_KEY` and nothing here spends a dollar — the assertion is
 * about which model object the helper hands the SDK, which is exactly the link
 * that can break.
 */
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(async () => ({ text: 'ok' })),
}))

const generateTextMock = vi.mocked(generateText)

/** The model id the helper actually passed on the most recent call. */
function lastModelId(): string {
  const call = generateTextMock.mock.calls.at(-1)?.[0]
  return (call?.model as { modelId: string }).modelId
}

describe('matrix variants', () => {
  it('compares exactly the two models #82 asks about', () => {
    expect(MATRIX_VARIANTS.map((variant) => variant.name)).toEqual([
      'gpt-5-mini',
      'gpt-5.6-luna',
    ])
    // The reported name IS the model id: the numbers posted to the ticket then
    // say which model produced them with no lookup table in between.
    for (const variant of MATRIX_VARIANTS) {
      expect(variant.input.modelId).toBe(variant.name)
    }
  })

  it('repeats each case enough to blunt single-sample noise', () => {
    expect(MATRIX_TRIAL_COUNT).toBeGreaterThan(1)
  })

  it('resolves a variant id to that OpenAI model, with no key', () => {
    const model = resolveVariantModel('gpt-5.6-luna') as {
      modelId: string
      provider: string
    }
    expect(model.modelId).toBe('gpt-5.6-luna')
    expect(model.provider).toContain('openai')
  })
})

describe('eval helper model plumbing', () => {
  it('runs the env-selected model when no variant asks for one', async () => {
    // The gate path, unchanged: `getCorvusModel()` with the repo default.
    vi.stubEnv('AI_CHAT_PROVIDER', '')
    vi.stubEnv('AI_CHAT_MODEL', '')

    await askCorvus('who are you?')

    expect(lastModelId()).toBe('gpt-5-mini')
    expect(generateTextMock.mock.calls.at(-1)?.[0].system).toBe(
      CORVUS_SYSTEM_PROMPT,
    )
    vi.unstubAllEnvs()
  })

  it('still honours AI_CHAT_MODEL on the default path', async () => {
    vi.stubEnv('AI_CHAT_PROVIDER', 'openai')
    vi.stubEnv('AI_CHAT_MODEL', 'gpt-5.4-mini')

    await askCorvus('who are you?')

    expect(lastModelId()).toBe('gpt-5.4-mini')
    vi.unstubAllEnvs()
  })

  it('runs the variant model when one is passed, ungrounded', async () => {
    // The env says mini; the variant says luna. The variant must win, or the
    // matrix silently measures one model twice.
    vi.stubEnv('AI_CHAT_MODEL', 'gpt-5-mini')

    await askCorvus('who are you?', {
      model: resolveVariantModel('gpt-5.6-luna'),
    })

    expect(lastModelId()).toBe('gpt-5.6-luna')
    vi.unstubAllEnvs()
  })

  it('runs the variant model when one is passed, grounded', async () => {
    vi.stubEnv('AI_CHAT_MODEL', 'gpt-5-mini')

    await askCorvusGrounded('what does the site say?', {
      retrieve: () => [],
      model: resolveVariantModel('gpt-5.6-luna'),
    })

    expect(lastModelId()).toBe('gpt-5.6-luna')
    vi.unstubAllEnvs()
  })

  it('leaves the grounded default path env-selected', async () => {
    vi.stubEnv('AI_CHAT_PROVIDER', '')
    vi.stubEnv('AI_CHAT_MODEL', '')

    await askCorvusGrounded('what does the site say?', { retrieve: () => [] })

    expect(lastModelId()).toBe('gpt-5-mini')
    // An empty retrieval is still the untouched persona prompt (#82 Batch 3's
    // byte-identity contract), and adding a model option did not disturb it.
    expect(generateTextMock.mock.calls.at(-1)?.[0].system).toBe(
      CORVUS_SYSTEM_PROMPT,
    )
    vi.unstubAllEnvs()
  })
})

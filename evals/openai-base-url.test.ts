// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  OPENAI_API_BASE_URL,
  OPENAI_BASE_URL_VAR,
  ensureOpenAIBaseUrl,
} from './openai-base-url'

/**
 * The default-only contract of the eval-run base URL pin (#82 Batch 6).
 *
 * @remarks Two things are worth a test here and neither is the happy path.
 *
 * The first is that this is a DEFAULT. If it ever became an override, an
 * operator pointing the evals at a proxy or a record/replay cache would get
 * silently redirected to the public API — spending real money on a run they
 * had deliberately arranged not to.
 *
 * The second is the import side effect. The module's whole reason for existing
 * is that merely being on an eval's import graph is enough; a version that
 * exported the function without calling it would type-check, pass a naive
 * test, and leave every `Factuality`-graded case 401ing exactly as before.
 *
 * These run from the eval root (`vitest run --root evals`), not the repo's
 * `unit` project, whose include globs cover `src/` and `scripts/` only. The
 * chain from an eval file to this module is guarded from the other end, in
 * `scripts/eval-harness.test.ts`, which the `unit` project does run.
 */

const originalBaseUrl = process.env[OPENAI_BASE_URL_VAR]

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env[OPENAI_BASE_URL_VAR]
  else process.env[OPENAI_BASE_URL_VAR] = originalBaseUrl
  vi.resetModules()
})

describe('ensureOpenAIBaseUrl', () => {
  it('supplies the public OpenAI root when nothing is configured', () => {
    const env: Record<string, string | undefined> = {}

    expect(ensureOpenAIBaseUrl(env)).toBe(OPENAI_API_BASE_URL)
    expect(env[OPENAI_BASE_URL_VAR]).toBe(OPENAI_API_BASE_URL)
  })

  it('is the base URL @ai-sdk/openai would have used anyway', () => {
    // Byte-identical to `createOpenAI`'s fallback in @ai-sdk/openai@3.0.87, so
    // pinning it changes nothing about the task path. If a future bump moves
    // that default, this constant is the thing to revisit.
    expect(OPENAI_API_BASE_URL).toBe('https://api.openai.com/v1')
  })

  it('leaves an explicitly configured base URL alone', () => {
    const env = { [OPENAI_BASE_URL_VAR]: 'https://proxy.internal/openai/v1' }

    expect(ensureOpenAIBaseUrl(env)).toBe('https://proxy.internal/openai/v1')
    expect(env[OPENAI_BASE_URL_VAR]).toBe('https://proxy.internal/openai/v1')
  })

  it('treats a blank value as unconfigured', () => {
    const env: Record<string, string | undefined> = {
      [OPENAI_BASE_URL_VAR]: '   ',
    }

    expect(ensureOpenAIBaseUrl(env)).toBe(OPENAI_API_BASE_URL)
    expect(env[OPENAI_BASE_URL_VAR]).toBe(OPENAI_API_BASE_URL)
  })

  it('is idempotent', () => {
    const env: Record<string, string | undefined> = {}
    ensureOpenAIBaseUrl(env)

    expect(ensureOpenAIBaseUrl(env)).toBe(OPENAI_API_BASE_URL)
  })

  it('never invents a key — only a URL', () => {
    const env: Record<string, string | undefined> = {}
    ensureOpenAIBaseUrl(env)

    expect(Object.keys(env)).toEqual([OPENAI_BASE_URL_VAR])
  })
})

describe('module side effect', () => {
  it('applies the default on import, with no call site', async () => {
    delete process.env[OPENAI_BASE_URL_VAR]
    vi.resetModules()

    await import('./openai-base-url')

    expect(process.env[OPENAI_BASE_URL_VAR]).toBe(OPENAI_API_BASE_URL)
  })

  it('is applied by importing the helpers every eval file uses', async () => {
    // The end-to-end shape of the fix, not just the module in isolation: an
    // eval file imports `./corvus-helpers` and gets the pin for free. If a
    // refactor ever severs that edge, this fails here as well as in
    // `scripts/eval-harness.test.ts`.
    delete process.env[OPENAI_BASE_URL_VAR]
    vi.resetModules()

    await import('./corvus-helpers')

    expect(process.env[OPENAI_BASE_URL_VAR]).toBe(OPENAI_API_BASE_URL)
  })

  it('does not clobber a configured value on import', async () => {
    process.env[OPENAI_BASE_URL_VAR] = 'https://proxy.internal/openai/v1'
    vi.resetModules()

    await import('./openai-base-url')

    expect(process.env[OPENAI_BASE_URL_VAR]).toBe(
      'https://proxy.internal/openai/v1',
    )
  })
})

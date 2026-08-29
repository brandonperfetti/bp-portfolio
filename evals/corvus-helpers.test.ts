// @vitest-environment node
import { generateText } from 'ai'
import type { MockInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  askCorvus,
  askCorvusGrounded,
  classifyTurn,
  formatTurnDefect,
} from './corvus-helpers'

/**
 * The eval harness's own reliability, pinned with a mocked provider (#122).
 *
 * @remarks Nothing here reaches a provider: `generateText` is replaced, so
 * these run with no `OPENAI_API_KEY` and cost nothing. That is the only way
 * this behaviour can be tested at all — the defects it guards against are
 * exactly the ones you cannot reproduce on demand against a real model.
 *
 * The two defects, both measured in CI run 33266583843 on `develop`:
 *
 * 1. **A dropped response.** The provider returned an empty string and the run
 *    scored it (see `empty-output.ts` for the scoring half). The harness never
 *    looked, so a transient dropout became a permanent data point.
 * 2. **A truncated response.** One row came back as `Top Tim…` and scored 0%,
 *    with nothing in the log to say the answer had been cut off rather than
 *    being wrong. `finishReason === 'length'` was sitting right there in the
 *    SDK result, unread.
 *
 * One retry each, then the row stands — a harness that retried until it liked
 * the answer would be selecting for good scores, which is the opposite of the
 * point. What the second attempt buys is that a one-off dropout stops being
 * recorded as a behavioural fact about Corvus.
 */

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}))

const generateTextMock = vi.mocked(generateText)

/** A `generateText` result with only the fields the harness reads. */
function turn(text: string, finishReason = 'stop') {
  return { text, finishReason } as unknown as Awaited<
    ReturnType<typeof generateText>
  >
}

/** Queue one result per attempt, in order. */
function respondWith(...turns: ReturnType<typeof turn>[]): void {
  generateTextMock.mockReset()
  for (const result of turns) generateTextMock.mockResolvedValueOnce(result)
}

/** `askCorvusGrounded` needs a retriever; the corpus is irrelevant here. */
const retrieve = () => []

let warn: MockInstance<typeof console.warn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

/** Every warning line the harness emitted, joined. */
function warnings(): string {
  return warn.mock.calls.map((call) => String(call[0])).join('\n')
}

describe.each([
  ['askCorvus', (prompt: string) => askCorvus(prompt)],
  [
    'askCorvusGrounded',
    (prompt: string) => askCorvusGrounded(prompt, { retrieve }),
  ],
])('%s', (_name, ask) => {
  it('does not retry a healthy turn', async () => {
    respondWith(turn('A real answer about Brandon.'))

    await expect(ask('who is brandon?')).resolves.toBe(
      'A real answer about Brandon.',
    )
    expect(generateTextMock).toHaveBeenCalledOnce()
    expect(warnings()).toBe('')
  })

  it('retries once when the response is empty', async () => {
    respondWith(turn(''), turn('The answer, second time.'))

    await expect(ask('who is brandon?')).resolves.toBe(
      'The answer, second time.',
    )
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('retries once when the response is whitespace only', async () => {
    respondWith(turn('   \n  '), turn('The answer, second time.'))

    await expect(ask('who is brandon?')).resolves.toBe(
      'The answer, second time.',
    )
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('retries once when the response was truncated', async () => {
    respondWith(turn('Top Tim', 'length'), turn('Top Timelines is a project.'))

    await expect(ask('what is top timelines?')).resolves.toBe(
      'Top Timelines is a project.',
    )
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('retries once when the turn ended abnormally', async () => {
    respondWith(turn('partial', 'content-filter'), turn('A clean answer.'))

    await expect(ask('who is brandon?')).resolves.toBe('A clean answer.')
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('stops at one retry and keeps the second answer', async () => {
    // A harness that retried until it liked the answer would be selecting for
    // good scores. Two attempts, then the row stands.
    respondWith(turn('Top Tim', 'length'), turn('Top Tim again', 'length'))

    await expect(ask('what is top timelines?')).resolves.toBe('Top Tim again')
    expect(generateTextMock).toHaveBeenCalledTimes(2)
  })

  it('logs a truncated row that survived its retry', async () => {
    respondWith(turn('Top Tim', 'length'), turn('Top Tim again', 'length'))

    await ask('what is top timelines?')

    const logged = warnings()
    expect(logged, 'the log must name the defect').toMatch(/truncat/i)
    expect(logged, 'and the SDK signal behind it').toContain('length')
    expect(logged, 'and the prompt, so the row is findable').toContain(
      'what is top timelines?',
    )
  })

  it('logs an empty row that survived its retry', async () => {
    respondWith(turn(''), turn(''))

    await expect(ask('who is brandon?')).resolves.toBe('')

    const logged = warnings()
    expect(logged).toMatch(/empty/i)
    expect(logged).toContain('who is brandon?')
  })

  it('lets a provider error through untouched', async () => {
    // The keyless CI proof depends on this: with no key the first attempt
    // throws AI_LoadAPIKeyError and that is the only thing `pnpm eval:ci`
    // reports. Swallowing it into a retry would turn a clear failure into two
    // slow ones.
    generateTextMock.mockReset()
    generateTextMock.mockRejectedValue(new Error('AI_LoadAPIKeyError'))

    await expect(ask('who is brandon?')).rejects.toThrow('AI_LoadAPIKeyError')
    expect(generateTextMock).toHaveBeenCalledOnce()
  })
})

describe('classifyTurn', () => {
  it('passes a turn that stopped because it was finished', () => {
    expect(classifyTurn({ text: 'An answer.', finishReason: 'stop' })).toBe(
      undefined,
    )
    expect(
      classifyTurn({ text: 'An answer.', finishReason: 'tool-calls' }),
    ).toBe(undefined)
  })

  it('calls an empty or whitespace-only turn empty', () => {
    expect(classifyTurn({ text: '', finishReason: 'stop' })).toBe('empty')
    expect(classifyTurn({ text: '  \n\t ', finishReason: 'stop' })).toBe(
      'empty',
    )
  })

  it('prefers "empty" when a turn is both empty and truncated', () => {
    // The model spent its whole budget on reasoning tokens and emitted no
    // text. The scorers will see nothing, so that is what the reader is told.
    expect(classifyTurn({ text: '', finishReason: 'length' })).toBe('empty')
  })

  it('reads truncation off the SDK finish reason', () => {
    // `length` is the unified spelling: @ai-sdk/openai@3.0.87 maps the
    // Responses API's incomplete_details.reason === 'max_output_tokens' onto
    // it, so no per-provider branch is needed.
    expect(classifyTurn({ text: 'Top Tim', finishReason: 'length' })).toBe(
      'truncated',
    )
  })

  it('flags every other finish reason as abnormal', () => {
    for (const finishReason of ['content-filter', 'error', 'other'] as const) {
      expect(classifyTurn({ text: 'partial', finishReason })).toBe(
        'abnormal-finish',
      )
    }
  })
})

describe('formatTurnDefect', () => {
  const base = {
    prompt: 'What is Top Timelines?',
    text: 'Top Tim',
    finishReason: 'length',
    defect: 'truncated',
  } as const

  it('says it is retrying on a non-final attempt', () => {
    const line = formatTurnDefect({ ...base, attempt: 1, attempts: 2 })

    expect(line).toContain('truncated response')
    expect(line).toContain('attempt 1/2')
    expect(line).toContain('finishReason=length')
    expect(line).toContain('retrying')
    expect(line).not.toContain('kept, scored as-is')
  })

  it('says the row was kept on the final attempt, and shows it', () => {
    const line = formatTurnDefect({ ...base, attempt: 2, attempts: 2 })

    expect(line).toContain('kept, scored as-is')
    // The tail of the output is the whole point: it answers "was `Top Tim`
    // a bad answer or a cut-off one?", which the score alone cannot.
    expect(line).toContain('"Top Tim"')
    expect(line).toContain('"What is Top Timelines?"')
  })

  it('is a single line, whatever the model emitted', () => {
    const line = formatTurnDefect({
      ...base,
      attempt: 2,
      attempts: 2,
      text: 'line one\nline two\n\nline three',
    })

    expect(line).not.toContain('\n')
    expect(line).toContain('line one line two line three')
  })

  it('omits the output for an empty turn, having nothing to show', () => {
    const line = formatTurnDefect({
      ...base,
      defect: 'empty',
      text: '',
      finishReason: 'stop',
      attempt: 2,
      attempts: 2,
    })

    expect(line).toContain('empty response')
    expect(line).not.toContain('output:')
  })

  it('clips a long prompt so one bad row cannot flood the log', () => {
    const line = formatTurnDefect({
      ...base,
      prompt: 'q'.repeat(500),
      attempt: 1,
      attempts: 2,
    })

    expect(line).toContain('…')
    expect(line.length).toBeLessThan(400)
  })
})

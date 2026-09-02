import { streamText } from 'ai'
import { MockLanguageModelV3, simulateReadableStream } from 'ai/test'
import { describe, expect, it, vi } from 'vitest'

import {
  CORVUS_EMPTY_REPLY_FAILSAFE,
  createEmptyReplyFailsafe,
} from '@/lib/ai/emptyReplyFailsafe'

import type { TextStreamPart, ToolSet } from 'ai'

/**
 * #138 — no blank turn can reach the client.
 *
 * @remarks Two layers, deliberately. The first drives the transform directly
 * so the injection condition is pinned exactly (which chunk, in what order,
 * on which finish reasons). The second runs the REAL `streamText` over a mock
 * provider and reads the bytes off `toUIMessageStreamResponse()`, because the
 * only claim that actually matters to a visitor is that the sentence reaches
 * the wire — and that depends on `experimental_transform` being a seam the
 * UI stream is derived from, which is an assertion about the SDK, not about
 * this module.
 */

type Part = TextStreamPart<ToolSet>

/** Run parts through the transform and collect what comes out. */
async function runTransform(parts: Part[], log?: (message: string) => void) {
  const transform = createEmptyReplyFailsafe({ log })()
  const out: Part[] = []

  const reader = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
    .pipeThrough(transform)
    .getReader()

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }

  return out
}

const finishStep = (finishReason: string): Part =>
  ({
    type: 'finish-step',
    finishReason,
    rawFinishReason: finishReason,
    response: {},
    usage: {},
    providerMetadata: undefined,
  }) as unknown as Part

const textDelta = (text: string, id = 'm0'): Part => ({
  type: 'text-delta',
  id,
  text,
})

describe('createEmptyReplyFailsafe', () => {
  it('injects the canned reply when a length finish streamed no text', async () => {
    const out = await runTransform([
      { type: 'start' } as Part,
      { type: 'text-start', id: 'm0' } as Part,
      { type: 'text-end', id: 'm0' } as Part,
      finishStep('length'),
    ])

    const injected = out.filter(
      (part) => part.type === 'text-delta' && part.text.length > 0,
    )
    expect(injected).toHaveLength(1)
    expect((injected[0] as { text: string }).text).toBe(
      CORVUS_EMPTY_REPLY_FAILSAFE,
    )
  })

  it('emits the reply as its own well-formed block before the step finishes', async () => {
    const out = await runTransform([
      { type: 'start' } as Part,
      finishStep('length'),
    ])

    const types = out.map((part) => part.type)
    expect(types).toEqual([
      'start',
      'text-start',
      'text-delta',
      'text-end',
      'finish-step',
    ])

    // Its own id, so it can never be appended to a block the model opened.
    const ids = out
      .filter((part) => part.type.startsWith('text-'))
      .map((part) => (part as { id: string }).id)
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).not.toBe('m0')
  })

  it('leaves a normal completion untouched', async () => {
    const parts = [
      { type: 'start' } as Part,
      { type: 'text-start', id: 'm0' } as Part,
      textDelta('Brandon works on '),
      textDelta('the portfolio.'),
      { type: 'text-end', id: 'm0' } as Part,
      finishStep('stop'),
    ]

    const out = await runTransform(parts)

    expect(out).toEqual(parts)
  })

  it('leaves a TRUNCATED length finish visually untouched', async () => {
    // The ticket's second symptom, deliberately not papered over: a
    // mid-sentence answer is still readable, and a marker would be noise on
    // every long reply.
    const parts = [
      { type: 'text-start', id: 'm0' } as Part,
      textDelta('Idempotency means that repeating a request'),
      finishStep('length'),
    ]

    const out = await runTransform(parts)

    expect(out).toEqual(parts)
  })

  it('does not inject on a non-length empty finish', async () => {
    // An empty `error`/`content-filter` turn is a different defect and must
    // not be dressed up as a budget problem.
    for (const reason of ['error', 'content-filter', 'other', 'stop']) {
      const out = await runTransform([finishStep(reason)])
      expect(out.some((part) => part.type === 'text-delta')).toBe(false)
    }
  })

  it('treats whitespace-only output as empty', async () => {
    const out = await runTransform([textDelta('   \n'), finishStep('length')])

    const injected = out.filter(
      (part) => part.type === 'text-delta' && part.text.trim().length > 0,
    )
    expect(injected).toHaveLength(1)
  })

  it('keeps per-turn state out of the transform value', async () => {
    // The SDK calls the factory once per stream; a shared `sawText` would let
    // one turn's text suppress the next turn's fail-safe.
    const factory = createEmptyReplyFailsafe({ log: () => {} })

    const first = await collect(factory, [
      textDelta('a real answer'),
      finishStep('stop'),
    ])
    const second = await collect(factory, [finishStep('length')])

    expect(first.some((part) => part.type === 'text-start')).toBe(false)
    expect(second.some((part) => part.type === 'text-start')).toBe(true)
  })

  describe('structured logging', () => {
    it('logs the injected case with its finish reason and text length', async () => {
      const log = vi.fn()
      await runTransform([finishStep('length')], log)

      expect(log).toHaveBeenCalledWith(
        '[corvus] finishReason=length textLength=0 failsafe=true',
      )
    })

    it('logs a truncated finish so its frequency is measurable', async () => {
      const log = vi.fn()
      await runTransform([textDelta('half an ans'), finishStep('length')], log)

      expect(log).toHaveBeenCalledWith(
        '[corvus] finishReason=length textLength=11 failsafe=false',
      )
    })

    it('stays quiet on a healthy turn', async () => {
      const log = vi.fn()
      await runTransform([textDelta('done'), finishStep('stop')], log)

      expect(log).not.toHaveBeenCalled()
    })
  })
})

/** Pipe `parts` through a fresh stream from `factory`. */
async function collect(
  factory: ReturnType<typeof createEmptyReplyFailsafe>,
  parts: Part[],
) {
  const out: Part[] = []
  const reader = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part)
      controller.close()
    },
  })
    .pipeThrough(factory())
    .getReader()

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(value)
  }
  return out
}

describe('the fail-safe through a real streamText', () => {
  /** Build a mock provider that finishes on `length` after `chunks`. */
  const modelFinishingOnLength = (
    chunks: Array<Record<string, unknown>>,
    finishReason = 'length',
  ) =>
    new MockLanguageModelV3({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            ...chunks,
            {
              // Provider spec v3 carries the finish reason as an object, not
              // a string (`LanguageModelV3FinishReason`). A bare string is
              // silently dropped and the step finishes `other` — which is how
              // this test earned its keep.
              type: 'finish',
              finishReason: { unified: finishReason, raw: finishReason },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1024, reasoning: 1024, text: 0 },
                totalTokens: 1034,
              },
            },
          ] as never,
        }),
      }),
    })

  /** Read a UI message stream response body to a string. */
  const readBody = async (response: Response) => await response.text()

  it('puts the canned sentence on the wire when reasoning ate the budget', async () => {
    // The measured #138 case: the model opens a text block, hidden reasoning
    // consumes maxOutputTokens, nothing is emitted, finishReason=length.
    const result = streamText({
      model: modelFinishingOnLength([
        { type: 'text-start', id: 'm0' },
        { type: 'text-end', id: 'm0' },
      ]),
      prompt: 'Write my 2000-word history essay',
      maxOutputTokens: 1024,
      experimental_transform: createEmptyReplyFailsafe({ log: () => {} }),
    })

    const body = await readBody(result.toUIMessageStreamResponse())

    expect(body).toContain(CORVUS_EMPTY_REPLY_FAILSAFE.slice(0, 40))
  })

  it('leaves a healthy completion byte-for-byte alone', async () => {
    const chunks = [
      { type: 'text-start', id: 'm0' },
      { type: 'text-delta', id: 'm0', delta: 'A real answer.' },
      { type: 'text-end', id: 'm0' },
    ]

    const withFailsafe = await readBody(
      streamText({
        model: modelFinishingOnLength(chunks, 'stop'),
        prompt: 'hello',
        experimental_transform: createEmptyReplyFailsafe({ log: () => {} }),
      }).toUIMessageStreamResponse(),
    )
    const without = await readBody(
      streamText({
        model: modelFinishingOnLength(chunks, 'stop'),
        prompt: 'hello',
      }).toUIMessageStreamResponse(),
    )

    // Ids are generated per run, so compare the payload text rather than raw
    // bytes; what matters is that no chunk was added, removed or reworded.
    const strip = (body: string) => body.replace(/"id":"[^"]*"/g, '"id":"*"')
    expect(strip(withFailsafe)).toBe(strip(without))
    expect(withFailsafe).not.toContain(CORVUS_EMPTY_REPLY_FAILSAFE.slice(0, 40))
  })
})

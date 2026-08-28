import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The embedding write path, with the provider entirely stubbed — these tests
 * spend zero provider dollars and need no key.
 *
 * What is actually pinned here is decision D6(a): the explicit `dimensions`
 * provider option on EVERY call (the thing that lets `-3-large` be swapped in
 * with no migration), the hard failure when a returned vector is the wrong
 * width, and the OpenAI pin that survives `AI_CHAT_PROVIDER=anthropic`.
 */
const embedMock = vi.fn()
const embedManyMock = vi.fn()

vi.mock('ai', () => ({
  embed: (...args: unknown[]) => embedMock(...args),
  embedMany: (...args: unknown[]) => embedManyMock(...args),
}))

const embeddingModelMock = vi.fn((id: string) => ({ modelId: id }))
vi.mock('@ai-sdk/openai', () => ({
  openai: {
    embeddingModel: (id: string) => embeddingModelMock(id),
  },
}))

import {
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBEDDING_MODEL,
  SUPPORTED_EMBEDDING_MODELS,
  assertEmbeddingDimension,
  embedChunks,
  embedQuery,
  getCorvusEmbeddingModel,
  getEmbeddingDimensions,
  getEmbeddingModelId,
  toVectorLiteral,
} from '@/lib/ai/embeddings'

const vector = (length: number, fill = 0.1) =>
  Array.from({ length }, () => fill)

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('configuration', () => {
  it('defaults to text-embedding-3-small at 1536 (decision D6(a))', () => {
    expect(getEmbeddingModelId()).toBe(DEFAULT_EMBEDDING_MODEL)
    expect(getEmbeddingModelId()).toBe('text-embedding-3-small')
    expect(getEmbeddingDimensions()).toBe(DEFAULT_EMBEDDING_DIMENSIONS)
    expect(getEmbeddingDimensions()).toBe(1536)
  })

  it('accepts text-embedding-3-large', () => {
    vi.stubEnv('AI_EMBEDDING_MODEL', 'text-embedding-3-large')
    expect(getEmbeddingModelId()).toBe('text-embedding-3-large')
  })

  it('EXCLUDES text-embedding-ada-002 — it cannot accept a dimensions option', () => {
    expect(SUPPORTED_EMBEDDING_MODELS as readonly string[]).not.toContain(
      'text-embedding-ada-002',
    )
    vi.stubEnv('AI_EMBEDDING_MODEL', 'text-embedding-ada-002')
    expect(() => getEmbeddingModelId()).toThrow(/not supported/)
  })

  it('falls back to the default dimension for an unparseable value', () => {
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', 'wide')
    expect(getEmbeddingDimensions()).toBe(1536)
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '0')
    expect(getEmbeddingDimensions()).toBe(1536)
  })

  it('honours an explicitly configured dimension', () => {
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '512')
    expect(getEmbeddingDimensions()).toBe(512)
  })
})

describe('provider pin', () => {
  it('resolves the OpenAI embedding model by default', () => {
    getCorvusEmbeddingModel()
    expect(embeddingModelMock).toHaveBeenCalledWith('text-embedding-3-small')
  })

  it('stays on OpenAI even when chat runs on Anthropic', () => {
    // @ai-sdk/anthropic ships no embedding model, so the embedding provider is
    // its own env axis. Flipping chat to Claude must not take the index down.
    vi.stubEnv('AI_CHAT_PROVIDER', 'anthropic')
    getCorvusEmbeddingModel()
    expect(embeddingModelMock).toHaveBeenCalledWith('text-embedding-3-small')
  })

  it('fails loudly rather than silently falling back for a non-openai provider', () => {
    vi.stubEnv('AI_EMBEDDING_PROVIDER', 'anthropic')
    expect(() => getCorvusEmbeddingModel()).toThrow(/pinned to OpenAI/)
  })
})

describe('assertEmbeddingDimension', () => {
  it('accepts a vector of the configured width', () => {
    expect(() => assertEmbeddingDimension(vector(1536), 1536)).not.toThrow()
  })

  it('throws on a SHORT vector, naming both widths', () => {
    expect(() => assertEmbeddingDimension(vector(512), 1536)).toThrow(
      /expected 1536, got 512/,
    )
  })

  it('throws on a LONG vector', () => {
    expect(() => assertEmbeddingDimension(vector(3072), 1536)).toThrow(
      /expected 1536, got 3072/,
    )
  })

  it('names the column it is protecting', () => {
    expect(() => assertEmbeddingDimension(vector(2), 1536)).toThrow(
      /vector\(1536\)/,
    )
  })
})

describe('toVectorLiteral', () => {
  it('renders pgvector text input format', () => {
    expect(toVectorLiteral([1, -0.5, 0])).toBe('[1,-0.5,0]')
  })
})

describe('embedQuery', () => {
  it('always sends an explicit dimensions provider option', async () => {
    embedMock.mockResolvedValue({ embedding: vector(1536) })

    await embedQuery('where has brandon worked')

    const call = embedMock.mock.calls[0][0] as {
      providerOptions: { openai: { dimensions: number } }
      value: string
      abortSignal?: AbortSignal
    }
    expect(call.providerOptions).toEqual({ openai: { dimensions: 1536 } })
    expect(call.value).toBe('where has brandon worked')
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('passes the configured dimension through, not a hard-coded 1536', async () => {
    vi.stubEnv('AI_EMBEDDING_DIMENSIONS', '512')
    embedMock.mockResolvedValue({ embedding: vector(512) })

    await embedQuery('hi')

    const call = embedMock.mock.calls[0][0] as {
      providerOptions: { openai: { dimensions: number } }
    }
    expect(call.providerOptions.openai.dimensions).toBe(512)
  })

  it('throws when the provider returns a wrongly sized vector', async () => {
    embedMock.mockResolvedValue({ embedding: vector(999) })
    await expect(embedQuery('hi')).rejects.toThrow(/dimension mismatch/)
  })

  it('honours a caller-supplied abort signal instead of making its own', async () => {
    embedMock.mockResolvedValue({ embedding: vector(1536) })
    const signal = AbortSignal.timeout(50)

    await embedQuery('hi', { abortSignal: signal })

    expect(
      (embedMock.mock.calls[0][0] as { abortSignal: AbortSignal }).abortSignal,
    ).toBe(signal)
  })
})

describe('embedChunks', () => {
  it('returns embeddings in input order with the dimensions option set', async () => {
    embedManyMock.mockResolvedValue({
      embeddings: [vector(1536, 0.1), vector(1536, 0.2)],
    })

    const result = await embedChunks(['a', 'b'])

    expect(result).toHaveLength(2)
    expect(result[0][0]).toBe(0.1)
    expect(result[1][0]).toBe(0.2)
    const call = embedManyMock.mock.calls[0][0] as {
      values: string[]
      providerOptions: { openai: { dimensions: number } }
    }
    expect(call.values).toEqual(['a', 'b'])
    expect(call.providerOptions).toEqual({ openai: { dimensions: 1536 } })
  })

  it('never calls the provider for an empty batch', async () => {
    expect(await embedChunks([])).toEqual([])
    expect(embedManyMock).not.toHaveBeenCalled()
  })

  it('fails the WHOLE batch when any vector is the wrong width', async () => {
    // Half-writing a document's chunks would leave the index internally
    // inconsistent; failing whole keeps the previous rows intact for repair.
    embedManyMock.mockResolvedValue({
      embeddings: [vector(1536), vector(1024)],
    })

    await expect(embedChunks(['a', 'b'])).rejects.toThrow(/chunk 1/)
  })
})

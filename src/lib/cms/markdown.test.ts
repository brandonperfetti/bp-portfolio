import { describe, expect, it } from 'vitest'

import type { CmsArticleBlock } from '@/lib/cms/types'

import { articleBlocksToMarkdown } from './markdown'

describe('articleBlocksToMarkdown', () => {
  it('treats undefined code rich-text plainText entries as empty strings', () => {
    const blocks = [
      {
        id: 'code-1',
        type: 'code',
        language: 'ts',
        richText: [
          { plainText: 'const a = 1' },
          // Defensive serialization path for malformed upstream data.
          { plainText: undefined as unknown as string },
          { plainText: ';' },
        ],
      },
    ] as CmsArticleBlock[]

    const markdown = articleBlocksToMarkdown(blocks)
    expect(markdown).toBe('```ts\nconst a = 1;\n```')
  })

  it('renders empty code blocks when richText is empty', () => {
    const blocks = [
      {
        id: 'code-empty',
        type: 'code',
        language: 'ts',
        richText: [],
      },
    ] as CmsArticleBlock[]

    const markdown = articleBlocksToMarkdown(blocks)
    expect(markdown).toBe('```ts\n\n```')
  })

  it('renders empty output when paragraph rich text only contains undefined text entries', () => {
    const blocks = [
      {
        id: 'paragraph-empty',
        type: 'paragraph',
        richText: [{ plainText: undefined as unknown as string }],
      },
    ] as CmsArticleBlock[]

    const markdown = articleBlocksToMarkdown(blocks)
    expect(markdown).toBe('')
  })
})

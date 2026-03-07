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
})

import type { CmsArticleBlock } from '@/lib/cms/types'

/**
 * Flatten a block tree into plain text (search indexing, RSS descriptions).
 *
 * @remarks Moved out of the retired Notion module — this helper is
 * source-agnostic and now operates on Lexical-derived blocks.
 */
export function flattenBlockText(blocks: CmsArticleBlock[]): string {
  const chunks: string[] = []

  function visit(block: CmsArticleBlock) {
    if (block.richText?.length) {
      chunks.push(block.richText.map((entry) => entry.plainText).join(' '))
    }

    if (block.caption?.length) {
      chunks.push(block.caption.map((entry) => entry.plainText).join(' '))
    }

    for (const child of block.children ?? []) {
      visit(child)
    }
  }

  for (const block of blocks) {
    visit(block)
  }

  return chunks.join(' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

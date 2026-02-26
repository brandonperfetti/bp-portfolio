import type { NotionBlock, NotionRichText } from '@/lib/cms/notion/contracts'
import type { CmsArticleBlock, CmsRichText } from '@/lib/cms/types'

import { listAllBlockChildren } from '@/lib/cms/notion/pagination'
import { mapWithConcurrency } from '@/lib/cms/notion/utils'

function mapRichText(richText: NotionRichText[] | undefined): CmsRichText[] {
  return (richText ?? []).map((entry) => ({
    plainText: entry.plain_text ?? entry.text?.content ?? '',
    href: entry.href ?? entry.text?.link?.url,
    annotations: entry.annotations
      ? {
          bold: entry.annotations.bold,
          italic: entry.annotations.italic,
          strikethrough: entry.annotations.strikethrough,
          underline: entry.annotations.underline,
          code: entry.annotations.code,
        }
      : undefined,
  }))
}

function mapBlock(block: NotionBlock, children?: CmsArticleBlock[]): CmsArticleBlock {
  const base: CmsArticleBlock = {
    id: block.id,
    type: block.type,
    children,
  }

  switch (block.type) {
    case 'paragraph':
      return { ...base, richText: mapRichText(block.paragraph?.rich_text) }
    case 'heading_1':
      return { ...base, richText: mapRichText(block.heading_1?.rich_text) }
    case 'heading_2':
      return { ...base, richText: mapRichText(block.heading_2?.rich_text) }
    case 'heading_3':
      return { ...base, richText: mapRichText(block.heading_3?.rich_text) }
    case 'bulleted_list_item':
      return {
        ...base,
        richText: mapRichText(block.bulleted_list_item?.rich_text),
      }
    case 'numbered_list_item':
      return {
        ...base,
        richText: mapRichText(block.numbered_list_item?.rich_text),
      }
    case 'to_do':
      return {
        ...base,
        richText: mapRichText(block.to_do?.rich_text),
        checked: Boolean(block.to_do?.checked),
      }
    case 'quote':
      return { ...base, richText: mapRichText(block.quote?.rich_text) }
    case 'callout':
      return { ...base, richText: mapRichText(block.callout?.rich_text) }
    case 'code':
      return {
        ...base,
        richText: mapRichText(block.code?.rich_text),
        caption: mapRichText(block.code?.caption),
        language: block.code?.language,
      }
    case 'image':
      return {
        ...base,
        url: block.image?.external?.url ?? block.image?.file?.url,
        caption: mapRichText(block.image?.caption),
      }
    case 'video':
      return {
        ...base,
        url: block.video?.external?.url ?? block.video?.file?.url,
        caption: mapRichText(block.video?.caption),
      }
    case 'bookmark':
      return {
        ...base,
        url: block.bookmark?.url,
        caption: mapRichText(block.bookmark?.caption),
      }
    case 'embed':
      return {
        ...base,
        url: block.embed?.url,
      }
    case 'child_page':
      return {
        ...base,
        richText: [{ plainText: block.child_page?.title ?? 'Child page' }],
      }
    default:
      return base
  }
}

async function mapTree(blocks: NotionBlock[]): Promise<CmsArticleBlock[]> {
  return mapWithConcurrency(
    blocks,
    async (block) => {
      let children: CmsArticleBlock[] | undefined

      if (block.has_children) {
        const childBlocks = await listAllBlockChildren(block.id)
        children = await mapTree(childBlocks)
      }

      return mapBlock(block, children)
    },
    2,
  )
}

export async function getNotionBlockTree(blockId: string): Promise<CmsArticleBlock[]> {
  const rootBlocks = await listAllBlockChildren(blockId)
  return mapTree(rootBlocks)
}

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

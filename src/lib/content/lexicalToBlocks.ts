import type { CmsArticleBlock, CmsRichText } from '@/lib/cms/types'

type LexicalNode = {
  type?: string
  [key: string]: unknown
}

const textToRichText = (node: LexicalNode): CmsRichText => {
  const format = typeof node.format === 'number' ? node.format : 0
  return {
    plainText: String(node.text ?? ''),
    annotations: {
      bold: Boolean(format & 1),
      italic: Boolean(format & 2),
      strikethrough: Boolean(format & 4),
      underline: Boolean(format & 8),
      code: Boolean(format & 16),
    },
  }
}

const inlineToRichText = (children: LexicalNode[] = []): CmsRichText[] => {
  const out: CmsRichText[] = []
  for (const child of children) {
    if (child.type === 'text') {
      out.push(textToRichText(child))
    } else if (child.type === 'link' || child.type === 'autolink') {
      const fields = (child.fields ?? {}) as { url?: string }
      for (const inner of (child.children as LexicalNode[]) ?? []) {
        if (inner.type === 'text') {
          out.push({ ...textToRichText(inner), href: fields.url })
        }
      }
    } else if (Array.isArray(child.children)) {
      out.push(...inlineToRichText(child.children as LexicalNode[]))
    }
  }
  return out
}

let autoId = 0
const block = (
  type: string,
  rest: Partial<CmsArticleBlock> = {},
): CmsArticleBlock => ({
  id: `lexical-${++autoId}`,
  type,
  ...rest,
})

/**
 * Convert Payload Lexical rich text into the v3 `CmsArticleBlock[]` shape.
 *
 * @remarks Bridge for the retained v3 rendering pipeline (`ArticleBody`,
 * markdown export, search text). Handles the node types the migration
 * produces; unknown nodes degrade to paragraphs of their inline text.
 * TODO(brandon): retire alongside the v3 block renderer if we move article
 * bodies to a native Lexical renderer in a later polish pass.
 */
export const lexicalToBlocks = (content: unknown): CmsArticleBlock[] => {
  const root = (content as { root?: { children?: LexicalNode[] } } | null)?.root
  if (!root?.children) return []
  const out: CmsArticleBlock[] = []

  const walk = (nodes: LexicalNode[]) => {
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
          out.push(
            block('paragraph', {
              richText: inlineToRichText(node.children as LexicalNode[]),
            }),
          )
          break
        case 'heading': {
          const tag = String(node.tag ?? 'h2')
          const type =
            tag === 'h1'
              ? 'heading_1'
              : tag === 'h3'
                ? 'heading_3'
                : 'heading_2'
          out.push(
            block(type, {
              richText: inlineToRichText(node.children as LexicalNode[]),
            }),
          )
          break
        }
        case 'list': {
          const listType = String(node.listType ?? 'bullet')
          for (const item of (node.children as LexicalNode[]) ?? []) {
            const itemType =
              listType === 'number'
                ? 'numbered_list_item'
                : listType === 'check'
                  ? 'to_do'
                  : 'bulleted_list_item'
            out.push(
              block(itemType, {
                richText: inlineToRichText(item.children as LexicalNode[]),
                ...(listType === 'check'
                  ? { checked: Boolean(item.checked) }
                  : {}),
              }),
            )
          }
          break
        }
        case 'quote':
          out.push(
            block('quote', {
              richText: inlineToRichText(node.children as LexicalNode[]),
            }),
          )
          break
        case 'horizontalrule':
          out.push(block('divider'))
          break
        case 'upload': {
          const value = node.value as
            { url?: string; alt?: string } | number | undefined
          if (value && typeof value === 'object' && value.url) {
            out.push(
              block('image', {
                url: value.url,
                caption: value.alt ? [{ plainText: value.alt }] : [],
              }),
            )
          }
          break
        }
        case 'block': {
          const fields = (node.fields ?? {}) as {
            blockType?: string
            code?: string
            language?: string
            content?: unknown
            style?: string
          }
          if (fields.blockType === 'code') {
            out.push(
              block('code', {
                richText: [{ plainText: String(fields.code ?? '') }],
                language: fields.language,
              }),
            )
          } else if (fields.blockType === 'banner') {
            out.push(
              block('callout', {
                richText: lexicalToBlocks(fields.content).flatMap(
                  (b) => b.richText ?? [],
                ),
              }),
            )
          }
          break
        }
        default:
          if (Array.isArray(node.children)) {
            const richText = inlineToRichText(node.children as LexicalNode[])
            if (richText.some((r) => r.plainText.trim())) {
              out.push(block('paragraph', { richText }))
            }
          }
      }
    }
  }

  walk(root.children)
  return out
}

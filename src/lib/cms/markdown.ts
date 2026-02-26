import type { CmsArticleBlock, CmsRichText } from '@/lib/cms/types'

function formatRichText(values?: CmsRichText[]) {
  if (!values?.length) {
    return ''
  }

  return values
    .map((entry) => {
      const text = entry.plainText ?? ''
      if (!text) {
        return ''
      }

      let value = text

      if (entry.annotations?.code) {
        value = `\`${value}\``
      }
      if (entry.annotations?.bold) {
        value = `**${value}**`
      }
      if (entry.annotations?.italic) {
        value = `*${value}*`
      }
      if (entry.annotations?.strikethrough) {
        value = `~~${value}~~`
      }

      if (entry.href) {
        return `[${value}](${entry.href})`
      }

      return value
    })
    .join('')
    .trim()
}

function renderListItem(block: CmsArticleBlock, marker: string, depth: number) {
  const indent = '  '.repeat(depth)
  const text = formatRichText(block.richText)
  const lines: string[] = [`${indent}${marker} ${text}`.trimEnd()]

  if (block.children?.length) {
    lines.push(renderBlocks(block.children, depth + 1))
  }

  return lines.join('\n')
}

function renderBlock(block: CmsArticleBlock, depth = 0): string {
  switch (block.type) {
    case 'heading_1':
      return `# ${formatRichText(block.richText)}`
    case 'heading_2':
      return `## ${formatRichText(block.richText)}`
    case 'heading_3':
      return `### ${formatRichText(block.richText)}`
    case 'paragraph':
      return formatRichText(block.richText)
    case 'quote':
    case 'callout': {
      const text = formatRichText(block.richText)
      return text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    case 'to_do':
      return `- [${block.checked ? 'x' : ' '}] ${formatRichText(block.richText)}`
    case 'code': {
      const language = (block.language || '').trim().toLowerCase()
      const code = (block.richText ?? []).map((entry) => entry.plainText).join('')
      return `\`\`\`${language}\n${code}\n\`\`\``
    }
    case 'image':
      if (!block.url) {
        return ''
      }
      return `![${formatRichText(block.caption) || ''}](${block.url})`
    case 'video':
    case 'embed':
    case 'bookmark':
      return block.url ? `[${block.url}](${block.url})` : ''
    case 'divider':
      return '---'
    case 'child_page':
      return `### ${formatRichText(block.richText)}`
    case 'bulleted_list_item':
      return renderListItem(block, '-', depth)
    case 'numbered_list_item':
      return renderListItem(block, '1.', depth)
    default:
      return formatRichText(block.richText)
  }
}

function renderBlocks(blocks: CmsArticleBlock[], depth = 0): string {
  const output: string[] = []

  for (let index = 0; index < blocks.length; ) {
    const block = blocks[index]

    if (
      block.type === 'bulleted_list_item' ||
      block.type === 'numbered_list_item'
    ) {
      const listType = block.type
      const listItems: string[] = []

      while (index < blocks.length && blocks[index].type === listType) {
        const marker = listType === 'bulleted_list_item' ? '-' : '1.'
        listItems.push(renderListItem(blocks[index], marker, depth))
        index += 1
      }

      output.push(listItems.join('\n'))
      continue
    }

    output.push(renderBlock(block, depth))
    index += 1
  }

  return output
    .map((entry) => entry.trimEnd())
    .filter(Boolean)
    .join('\n\n')
}

export function articleBlocksToMarkdown(blocks: CmsArticleBlock[]) {
  return renderBlocks(blocks).trim()
}

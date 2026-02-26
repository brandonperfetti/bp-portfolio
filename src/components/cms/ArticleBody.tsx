import Image from 'next/image'
import Link from 'next/link'

import { CodeSnippet } from '@/components/cms/CodeSnippet'
import type { CmsArticleBlock, CmsRichText } from '@/lib/cms/types'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'

function RichText({ values }: { values?: CmsRichText[] }) {
  if (!values?.length) {
    return null
  }

  return (
    <>
      {values.map((entry, index) => {
        const content = entry.plainText
        if (!content) {
          return null
        }

        let node: React.ReactNode = content

        if (entry.annotations?.code) {
          node = <code>{node}</code>
        }
        if (entry.annotations?.bold) {
          node = <strong>{node}</strong>
        }
        if (entry.annotations?.italic) {
          node = <em>{node}</em>
        }
        if (entry.annotations?.underline) {
          node = <span className="underline">{node}</span>
        }
        if (entry.annotations?.strikethrough) {
          node = <span className="line-through">{node}</span>
        }

        if (entry.href) {
          return (
            <Link
              key={`${content}-${index}`}
              href={entry.href}
              {...getExternalLinkProps(entry.href)}
            >
              {node}
            </Link>
          )
        }

        return <span key={`${content}-${index}`}>{node}</span>
      })}
    </>
  )
}

function richTextToPlain(values?: CmsRichText[]) {
  return (values ?? []).map((entry) => entry.plainText).join('')
}

function renderBlockNodes(blocks: CmsArticleBlock[]) {
  const nodes: React.ReactNode[] = []

  for (let index = 0; index < blocks.length; ) {
    const block = blocks[index]

    if (
      block.type === 'bulleted_list_item' ||
      block.type === 'numbered_list_item'
    ) {
      const listType = block.type
      const items: React.ReactNode[] = []
      const firstId = block.id

      while (index < blocks.length && blocks[index].type === listType) {
        const item = blocks[index]
        items.push(
          <li key={item.id}>
            <RichText values={item.richText} />
            {item.children?.length ? renderBlockNodes(item.children) : null}
          </li>,
        )
        index += 1
      }

      nodes.push(
        listType === 'bulleted_list_item' ? (
          <ul key={`ul-${firstId}`}>{items}</ul>
        ) : (
          <ol key={`ol-${firstId}`}>{items}</ol>
        ),
      )

      continue
    }

    nodes.push(<BlockNode key={block.id} block={block} />)
    index += 1
  }

  return nodes
}

function BlockNode({ block }: { block: CmsArticleBlock }) {
  switch (block.type) {
    case 'heading_1':
      return (
        <h1>
          <RichText values={block.richText} />
        </h1>
      )
    case 'heading_2':
      return (
        <h2>
          <RichText values={block.richText} />
        </h2>
      )
    case 'heading_3':
      return (
        <h3>
          <RichText values={block.richText} />
        </h3>
      )
    case 'paragraph':
      return (
        <p>
          <RichText values={block.richText} />
        </p>
      )
    case 'quote':
      return (
        <blockquote>
          <RichText values={block.richText} />
        </blockquote>
      )
    case 'callout':
      return (
        <div className="rounded-xl border border-teal-200/60 bg-teal-50/50 px-4 py-3 text-zinc-800 dark:border-teal-900/50 dark:bg-teal-950/20 dark:text-zinc-100">
          <RichText values={block.richText} />
        </div>
      )
    case 'to_do':
      return (
        <p>
          <input
            checked={Boolean(block.checked)}
            readOnly
            type="checkbox"
            className="mr-2"
          />
          <RichText values={block.richText} />
        </p>
      )
    case 'code': {
      const language = (block.language || 'plaintext').trim().toLowerCase()
      const code = richTextToPlain(block.richText)
      return (
        <figure>
          <CodeSnippet language={language} code={code} />
          {block.caption?.length ? (
            <figcaption>
              <RichText values={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      )
    }
    case 'image':
      if (!block.url) {
        return null
      }

      return (
        <figure>
          <Image
            src={getOptimizedImageUrl(block.url, {
              width: 1600,
              crop: 'fit',
            })}
            alt={richTextToPlain(block.caption) || ''}
            width={1600}
            height={900}
            sizes="(min-width: 1280px) 42rem, (min-width: 1024px) 42rem, 100vw"
            className="h-auto w-full rounded-xl"
          />
          {block.caption?.length ? (
            <figcaption>
              <RichText values={block.caption} />
            </figcaption>
          ) : null}
        </figure>
      )
    case 'video':
    case 'bookmark':
    case 'embed':
      if (!block.url) {
        return null
      }

      return (
        <p>
          <Link href={block.url} {...getExternalLinkProps(block.url)}>
            {block.url}
          </Link>
        </p>
      )
    case 'divider':
      return <hr />
    default:
      return block.richText?.length ? (
        <p>
          <RichText values={block.richText} />
        </p>
      ) : null
  }
}

export function ArticleBody({ blocks }: { blocks: CmsArticleBlock[] }) {
  return <>{renderBlockNodes(blocks)}</>
}

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProseBlockComponent } from '@/blocks/Prose/Component'
import { ArticleBody } from '@/components/cms/ArticleBody'
import { Prose } from '@/components/Prose'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import type { ProseBlock } from '@/payload-types'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const node = (type: string, rest: Record<string, unknown> = {}) => ({
  type,
  version: 1,
  ...rest,
})
const text = (value: string, format = 0) =>
  node('text', { text: value, format })

/**
 * A body tree shaped the way the about page's stored `hero.richText` is:
 * headings, paragraphs with inline marks and a link, and a list. This is the
 * content #35 moves, so it is the content the block is tested against.
 */
const ABOUT_SHAPED_TREE = {
  root: node('root', {
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      node('heading', {
        tag: 'h2',
        children: [text('Navigating Complexities with Agile Leadership')],
      }),
      node('paragraph', {
        children: [
          text('I have led and contributed across '),
          text('diverse teams', 1),
          text(', shifting between strategy and implementation.'),
        ],
      }),
      node('list', {
        listType: 'bullet',
        children: [
          node('listitem', { children: [text('Clear priorities')] }),
          node('listitem', { children: [text('Fast iteration')] }),
        ],
      }),
      node('quote', { children: [text('Delivery is a team sport.')] }),
      node('paragraph', {
        children: [
          node('link', {
            fields: { url: 'https://brandonperfetti.com' },
            children: [text('Read more')],
          }),
        ],
      }),
    ],
  }),
}

const block = (content: unknown): ProseBlock =>
  ({ blockType: 'prose', content }) as unknown as ProseBlock

/**
 * #35's acceptance criterion is a typography claim, so the test is a
 * comparison rather than a class-list assertion: the block has to produce the
 * same DOM the article route produces for the same content. It does that by
 * sharing the pipeline rather than by copying it — this is what stops the two
 * drifting.
 */
describe('ProseBlockComponent', () => {
  const proseWrapper = (container: HTMLElement) =>
    container.querySelector('.prose') as HTMLElement

  it('renders the exact markup the article body renders for the same tree', () => {
    const fromBlock = render(ProseBlockComponent(block(ABOUT_SHAPED_TREE)))
    const fromArticle = render(
      <Prose>
        <ArticleBody blocks={lexicalToBlocks(ABOUT_SHAPED_TREE)} />
      </Prose>,
    )

    expect(proseWrapper(fromBlock.container).innerHTML).toBe(
      proseWrapper(fromArticle.container).innerHTML,
    )
  })

  it('wraps its content in the article typography container', () => {
    const { container } = render(ProseBlockComponent(block(ABOUT_SHAPED_TREE)))
    const prose = proseWrapper(container)

    expect(prose).toHaveClass('prose', 'dark:prose-invert')
    // No width override: an article body caps at the prose measure, and the
    // whole point of the block is to match it.
    expect(prose.className).not.toContain('max-w-')
  })

  it('renders the structure the tree describes, not a flattened blob', () => {
    render(ProseBlockComponent(block(ABOUT_SHAPED_TREE)))

    expect(
      screen.getByRole('heading', {
        name: 'Navigating Complexities with Agile Leadership',
      }).tagName,
    ).toBe('H2')
    expect(screen.getByText('diverse teams').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.getByText('Delivery is a team sport.').closest('blockquote'),
    ).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Read more' })).toHaveAttribute(
      'href',
      'https://brandonperfetti.com',
    )
  })

  it('renders nothing for content that is missing or empty', () => {
    for (const content of [
      null,
      undefined,
      { root: node('root', { children: [] }) },
    ]) {
      const { container } = render(ProseBlockComponent(block(content)))
      expect(container).toBeEmptyDOMElement()
    }
  })

  it('keeps its rhythm at root and hands it to the column when hosted', () => {
    const root = render(ProseBlockComponent(block(ABOUT_SHAPED_TREE)))
    expect(proseWrapper(root.container)).toHaveClass('my-12')

    const column = render(
      ProseBlockComponent({
        ...block(ABOUT_SHAPED_TREE),
        hosted: 'column',
      }),
    )
    expect(proseWrapper(column.container)).not.toHaveClass('my-12')
  })
})

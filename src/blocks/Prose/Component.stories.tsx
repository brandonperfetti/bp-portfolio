import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ProseBlockComponent } from '@/blocks/Prose/Component'

const node = (type: string, rest: Record<string, unknown> = {}) => ({
  type,
  version: 1,
  ...rest,
})
const text = (value: string, format = 0) =>
  node('text', { text: value, format })

/**
 * Representative body content: the node types the about page's stored tree
 * uses, plus the ones a Notion-migrated article carries — headings, inline
 * marks, a link, both list kinds, a quote, a rule and a code block.
 */
const BODY = {
  root: node('root', {
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      node('heading', {
        tag: 'h2',
        children: [text('Navigating complexity with agile leadership')],
      }),
      node('paragraph', {
        children: [
          text('I have led and contributed across '),
          text('diverse teams', 1),
          text(', shifting between strategic planning and '),
          text('hands-on implementation', 2),
          text(' as the work demanded.'),
        ],
      }),
      node('list', {
        listType: 'bullet',
        children: [
          node('listitem', { children: [text('Clear priorities')] }),
          node('listitem', { children: [text('Fast iteration')] }),
          node('listitem', { children: [text('Reliable delivery')] }),
        ],
      }),
      node('quote', {
        children: [
          text('A plan nobody can execute is a wish with a Gantt chart.'),
        ],
      }),
      node('heading', {
        tag: 'h3',
        children: [text('Driving innovation through continuous learning')],
      }),
      node('paragraph', {
        children: [
          text('More on that in '),
          node('link', {
            fields: { url: 'https://brandonperfetti.com/articles' },
            children: [text('the articles')],
          }),
          text('.'),
        ],
      }),
      node('list', {
        listType: 'number',
        children: [
          node('listitem', { children: [text('Measure')] }),
          node('listitem', { children: [text('Change one thing')] }),
          node('listitem', { children: [text('Measure again')] }),
        ],
      }),
      node('horizontalrule'),
      node('block', {
        fields: {
          blockType: 'code',
          language: 'ts',
          code: "export const rhythm = (hosted?: 'root' | 'column') =>\n  hosted === 'column' ? '' : 'my-12'",
        },
      }),
    ],
  }),
}

/**
 * Prose block (#35). A plain rich-text block that renders with the article
 * body's typography — the thing whose absence forced the about page's body
 * onto `hero.richText`.
 */
const meta = {
  title: 'PageBuilder/Prose',
  component: ProseBlockComponent,
  tags: ['autodocs'],
  args: {
    blockType: 'prose',
    content: BODY,
  } as never,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProseBlockComponent>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The full fixture. The assertions are on structure, not on class names:
 * the block earns article typography by sharing the article's renderer, so
 * what is worth guarding is that real headings, lists, quotes and rules come
 * out the other side.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const prose = canvasElement.querySelector('.prose') as HTMLElement

    await expect(prose).toHaveClass('prose', 'dark:prose-invert')
    await expect(
      canvas.getByRole('heading', {
        name: 'Navigating complexity with agile leadership',
      }).tagName,
    ).toBe('H2')
    await expect(
      canvas.getByRole('heading', {
        name: 'Driving innovation through continuous learning',
      }).tagName,
    ).toBe('H3')
    await expect(canvas.getByText('diverse teams').tagName).toBe('STRONG')
    await expect(canvas.getByText('hands-on implementation').tagName).toBe('EM')
    await expect(prose.querySelectorAll('ul > li')).toHaveLength(3)
    await expect(prose.querySelectorAll('ol > li')).toHaveLength(3)
    await expect(prose.querySelector('blockquote')).not.toBeNull()
    await expect(prose.querySelector('hr')).not.toBeNull()
    await expect(prose.querySelector('pre')).not.toBeNull()
    await expect(
      canvas.getByRole('link', { name: 'the articles' }),
    ).toHaveAttribute('href', 'https://brandonperfetti.com/articles')

    // The typographic contract: the body is measured, not full-bleed, and it
    // is the site's own scale — a `prose` h2 is 20px on 28px, from
    // `typography.ts`, not the browser's 24px default.
    await expect(prose.clientWidth).toBeLessThanOrEqual(
      (prose.parentElement as HTMLElement).clientWidth,
    )
    const h2 = prose.querySelector('h2') as HTMLElement
    await expect(getComputedStyle(h2).fontSize).toBe('20px')
    await expect(getComputedStyle(h2).lineHeight).toBe('28px')
  },
}

/**
 * The #40 contract: at root the block carries its own `my-12`; inside a
 * column the stack owns the rhythm. The class rides on the `Prose` wrapper
 * itself rather than an extra div, so this also checks nothing else crept in.
 */
export const HostedInAColumn: Story = {
  render: (args) => (
    <div>
      <div data-testid="root-hosted">
        <ProseBlockComponent {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <ProseBlockComponent {...args} hosted="column" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector(
      '[data-testid="root-hosted"] > *',
    ) as HTMLElement
    const column = canvasElement.querySelector(
      '[data-testid="column-hosted"] > *',
    ) as HTMLElement

    await expect(root).toHaveClass('prose', 'my-12')
    await expect(column).toHaveClass('prose')
    await expect(column).not.toHaveClass('my-12')
    await expect(getComputedStyle(column).marginTop).toBe('0px')
  },
}

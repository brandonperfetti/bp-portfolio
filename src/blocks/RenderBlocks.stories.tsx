import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { Page } from '@/payload-types'

type LayoutBlock = NonNullable<Page['layout']>[number]

const richText = (text: string, heading?: string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      ...(heading
        ? [
            {
              type: 'heading',
              tag: 'h2',
              version: 1,
              children: [{ type: 'text', text: heading, version: 1 }],
            },
          ]
        : []),
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', text, version: 1 }],
      },
    ],
  },
})

const DEMO_BLOCKS: LayoutBlock[] = [
  {
    blockType: 'content',
    columns: [
      {
        id: 'c1',
        size: 'half',
        richText: richText(
          'Columns stack on mobile and span a 12-column grid from lg up. Each column is rich text with an optional link.',
          'Build pages in the admin',
        ),
        enableLink: false,
      },
      {
        id: 'c2',
        size: 'half',
        richText: richText(
          'Every block registered in RenderBlocks maps 1:1 to a block in the Payload admin picker — and to a story here.',
          'One set, three surfaces',
        ),
        enableLink: false,
      },
    ],
  },
  { blockType: 'spacer', size: 'sm' },
  {
    blockType: 'cta',
    richText: richText(
      'Calls to action pair rich text with up to two links.',
      'Like what you see?',
    ),
    links: [
      {
        id: 'l1',
        link: {
          type: 'custom',
          url: 'https://brandonperfetti.com',
          label: 'Visit the site',
          appearance: 'default',
        },
      },
      {
        id: 'l2',
        link: {
          type: 'custom',
          url: 'https://github.com/brandonperfetti',
          label: 'GitHub',
          appearance: 'outline',
        },
      },
    ],
  },
  { blockType: 'spacer', size: 'md' },
  {
    blockType: 'featureCardGrid',
    heading: 'What you get',
    intro:
      'Feature cards in the site card language — icon, eyebrow, title, copy, link.',
    cards: [
      {
        id: 'f1',
        eyebrow: 'Speed',
        title: 'Fast by default',
        copy: 'Static rendering with tag-based revalidation keeps pages instant.',
        enableLink: false,
      },
      {
        id: 'f2',
        eyebrow: 'Editing',
        title: 'Composed in the admin',
        copy: 'Blocks map 1:1 to components — build pages without a deploy.',
        enableLink: false,
      },
      {
        id: 'f3',
        eyebrow: 'Motion',
        title: 'Reduced-motion safe',
        copy: 'Every animated surface degrades to static, functional DOM.',
        enableLink: false,
      },
    ],
  },
  { blockType: 'spacer', size: 'md' },
  {
    blockType: 'stats',
    items: [
      { id: 's1', value: '12+', label: 'Years shipping software' },
      { id: 's2', value: '50', label: 'Technologies in the stack' },
      { id: 's3', value: '99.9%', label: 'Uptime attitude' },
    ],
  },
  {
    blockType: 'faqList',
    heading: 'Questions',
    items: [
      {
        id: 'q1',
        question: 'Can I build pages without deploys?',
        answer: richText('Yes — publish in the admin and the page is live.'),
      },
      {
        id: 'q2',
        question: 'Do blocks match Storybook?',
        answer: richText('One 1:1 set across admin, components, and stories.'),
      },
    ],
  },
  {
    blockType: 'testimonials',
    heading: 'Kind words',
    items: [
      {
        id: 't1',
        quote: 'Brandon turned a vague roadmap into shipped software.',
        name: 'A Happy Stakeholder',
        role: 'VP Product',
      },
      {
        id: 't2',
        quote: 'The rare PM who reads the code before the ticket.',
        name: 'A Fellow Engineer',
        role: 'Staff Engineer',
      },
    ],
  },
  {
    blockType: 'videoEmbed',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Demo video',
  },
  { blockType: 'spacer', size: 'md' },
  {
    blockType: 'photoStrip',
    images: [
      'https://picsum.photos/seed/strip-1/1000/1125',
      'https://picsum.photos/seed/strip-2/1000/1125',
      'https://picsum.photos/seed/strip-3/1000/1125',
      'https://picsum.photos/seed/strip-4/1000/1125',
      'https://picsum.photos/seed/strip-5/1000/1125',
    ].map((url, i) => ({ id: i + 1, url, alt: '' })),
  } as unknown as LayoutBlock,
  { blockType: 'spacer', size: 'md' },
  {
    blockType: 'shaderHero',
    preset: 'northern-lights-2',
    richText: richText(
      'A bounded animated shader panel with text overlay. Falls back to a static gradient without WebGPU or under reduced motion.',
      'Shader section',
    ),
  },
]

/**
 * The layout block set (#23) as CMS data: a container whose two columns
 * hold different block types. Kept out of `DEMO_BLOCKS` because several
 * stories address that array by index.
 */
const CONTAINER_DEMO: LayoutBlock[] = [
  {
    blockType: 'container',
    columns: [
      {
        blockType: 'column',
        id: 'col-main',
        size: 'twoThirds',
        content: [
          {
            blockType: 'cta',
            id: 'col-main-cta',
            richText: richText(
              'Two thirds of the row from lg up. Below that it spans the full width and the rail drops beneath it.',
              'Main column',
            ),
            links: [],
          },
        ],
      },
      {
        blockType: 'column',
        id: 'col-rail',
        size: 'oneThird',
        content: [
          {
            blockType: 'stats',
            id: 'col-rail-stats',
            items: [
              { id: 'r1', value: '2/3', label: 'Main share' },
              { id: 'r2', value: '1/3', label: 'Rail share' },
            ],
          },
        ],
      },
    ],
  },
]

/**
 * CMS page-builder blocks (§ page builder): the exact components the
 * catch-all route renders for admin-composed pages. Each entry in the admin
 * block picker corresponds to a component dispatched by RenderBlocks and
 * demoed here.
 */
const meta = {
  title: 'PageBuilder/RenderBlocks',
  component: RenderBlocks,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RenderBlocks>

export default meta
type Story = StoryObj<typeof meta>

export const AllBlocks: Story = {
  args: { blocks: DEMO_BLOCKS },
}

export const ContentColumns: Story = {
  args: { blocks: [DEMO_BLOCKS[0]] },
}

export const CallToAction: Story = {
  args: { blocks: [DEMO_BLOCKS[2]] },
  // Interaction: both CMSLink-rendered actions resolve their hrefs.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: /visit the site/i }),
    ).toHaveAttribute('href', 'https://brandonperfetti.com')
    await expect(canvas.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/brandonperfetti',
    )
  },
}

/**
 * Interaction: the FAQ accordion is a native details/summary — keyboard and
 * pointer operable with zero JS. The play toggles an item open and closed.
 */
export const FaqAccordion: Story = {
  args: {
    blocks: [
      DEMO_BLOCKS.find((block) => block.blockType === 'faqList') as LayoutBlock,
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const question = canvas.getByText('Can I build pages without deploys?')
    const details = question.closest('details')
    await expect(details).not.toBeNull()
    await expect(details).not.toHaveAttribute('open')

    await userEvent.click(question)
    await waitFor(() => expect(details).toHaveAttribute('open'))
    await expect(
      canvas.getByText(/publish in the admin and the page is live/i),
    ).toBeVisible()

    await userEvent.click(question)
    await waitFor(() => expect(details).not.toHaveAttribute('open'))
  },
}

export const ShaderSection: Story = {
  args: { blocks: [DEMO_BLOCKS[DEMO_BLOCKS.length - 1]] },
}

export const FeatureCards: Story = {
  args: { blocks: [DEMO_BLOCKS[4]] },
}

export const PhotoStripBlock: Story = {
  args: {
    blocks: [
      DEMO_BLOCKS.find(
        (block) => block.blockType === 'photoStrip',
      ) as LayoutBlock,
    ],
  },
}

/**
 * The #23 acceptance layout as an editor composes it: one container, a 2/3
 * main column and a 1/3 rail, different block types in each.
 */
export const ContainerColumns: Story = {
  args: { blocks: CONTAINER_DEMO },
  // Interaction: the columns claim 8 + 4 tracks and both keep the mobile
  // full-row span that makes the grid stack below `lg`.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const main = canvas.getByText('Main column').closest('div.col-span-12')
    await expect(main).toHaveClass('col-span-12', 'lg:col-span-8')
    await expect(main?.parentElement).toHaveClass('grid', 'grid-cols-12')

    const rail = canvas.getByText('Rail share').closest('div.col-span-12')
    await expect(rail).toHaveClass('col-span-12', 'lg:col-span-4')
  },
}

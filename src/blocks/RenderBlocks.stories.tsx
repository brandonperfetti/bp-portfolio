import type { Meta, StoryObj } from '@storybook/nextjs-vite'

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
    blockType: 'shaderHero',
    preset: 'northern-lights-2',
    richText: richText(
      'A bounded animated shader panel with text overlay. Falls back to a static gradient without WebGPU or under reduced motion.',
      'Shader section',
    ),
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
}

export const ShaderSection: Story = {
  args: { blocks: [DEMO_BLOCKS[DEMO_BLOCKS.length - 1]] },
}

export const FeatureCards: Story = {
  args: { blocks: [DEMO_BLOCKS[4]] },
}

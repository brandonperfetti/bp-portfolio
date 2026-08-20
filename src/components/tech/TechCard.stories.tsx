import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { TechCard } from '@/components/tech/TechCard'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { TechSignalSummary } from '@/lib/tech/githubSignals'

const nextItem: CmsEntityItem = {
  slug: 'nextjs',
  name: 'Next.js',
  description:
    'Full-stack React framework: App Router, RSC, ISR, and the deployment backbone of this site.',
  category: 'Framework',
  proficiency: 'daily',
  link: { href: 'https://nextjs.org', label: 'nextjs.org' },
}

const strongSignal: TechSignalSummary = {
  key: 'nextjs',
  score: 42,
  repoCount: 9,
  reasons: ['package', 'primary-language', 'topic'],
  intensity: 1,
}

const usesItem: CmsEntityItem = {
  slug: 'macbook',
  name: '14-inch MacBook Pro, Apple M2 Pro',
  description:
    'Strong performance for daily development, project management, and content work.',
}

/**
 * Shared card for the /tech and /uses visualizations (wow moment #3):
 * category/proficiency chips, live GitHub activity badge, and an expandable
 * scan-evidence section.
 */
const meta = {
  title: 'Tech/TechCard',
  component: TechCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul role="list" className="max-w-sm list-none">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof TechCard>

export default meta
type Story = StoryObj<typeof meta>

export const WithGithubSignal: Story = {
  args: { item: nextItem, signal: strongSignal },
}

export const WithWeakSignal: Story = {
  args: {
    item: { ...nextItem, slug: 'vitest', name: 'Vitest', category: 'Testing' },
    signal: {
      key: 'vitest',
      score: 4,
      repoCount: 1,
      reasons: ['package'],
      intensity: 0.1,
    },
  },
}

export const WithoutSignal: Story = {
  args: { item: nextItem },
}

export const UsesEntry: Story = {
  args: { item: usesItem },
}

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { Page } from '@/payload-types'

type LayoutBlock = NonNullable<Page['layout']>[number]

/**
 * #217 phase 1 — the **counterfactual** for "a page hosting the block has
 * exactly one `<h1>`".
 *
 * @remarks Its own file because the counterfactual is a module-level
 * substitution: `vi.mock` is hoisted and file-scoped, so the only way to run
 * the block with a different heading constant *without* touching the block's
 * source is to give that substitution a file of its own.
 *
 * **What this proves that the positive test cannot.** The positive case
 * (`Component.test.tsx`) shows the page has one `<h1>`. On its own that is
 * consistent with the block never emitting a heading at all, or with the level
 * being decided somewhere other than the block. Here the *only* thing that
 * changes is `CORVUS_CHAT_BLOCK_HEADING_LEVEL` — the same layout, the same
 * dispatcher, the same block component — and the page gains a second `<h1>`.
 * So the constant is the thing that decides, and the block's default is
 * load-bearing.
 *
 * The earlier form of this test rendered `<CorvusChat headingLevel="h1" />`
 * directly, which proved a fact about the *component* rather than about
 * `CorvusChatBlockComponent`. This routes through `RenderBlocks`, so the whole
 * path the CMS takes is exercised.
 */

vi.mock('@/blocks/CorvusChat/variants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/blocks/CorvusChat/variants')>()),
  // The counterfactual, and the ONLY difference from the positive case.
  CORVUS_CHAT_BLOCK_HEADING_LEVEL: 'h1' as const,
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    error: undefined,
  }),
}))
vi.mock('ai', () => ({ DefaultChatTransport: vi.fn() }))
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}))
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/motion/ParallaxGroup', () => ({
  ParallaxGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/components/motion/AnimatedHeadline', () => ({
  AnimatedHeadline: ({
    text,
    as: As = 'h1',
    className,
  }: {
    text: string
    as?: 'h1' | 'h2' | 'h3'
    className?: string
  }) => <As className={className}>{text}</As>,
}))
vi.mock('@/blocks/ArticlesArchive/Component', () => ({
  ArticlesArchiveComponent: () => null,
}))
vi.mock('@/blocks/PostRollup/Component', () => ({
  PostRollupComponent: () => null,
}))
vi.mock('@/blocks/WorkHistoryCard/Component', () => ({
  WorkHistoryCardComponent: () => null,
}))
vi.mock('@/blocks/SocialLinks/Component', () => ({
  SocialLinksBlockComponent: () => null,
}))

const PAGE_LAYOUT = [
  {
    blockType: 'heading',
    text: 'Ask me anything',
    level: 'h1',
    variant: 'line',
  } as LayoutBlock,
  { blockType: 'corvusChat', variant: 'compact', id: 'c1' } as LayoutBlock,
]

describe('corvusChat block heading level — counterfactual', () => {
  it('with the block constant at h1, the same page dispatches TWO h1s', () => {
    Element.prototype.scrollTo = vi.fn()
    render(<RenderBlocks blocks={PAGE_LAYOUT} />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(2)
    // And the second one is the block's — not some other heading. This is what
    // ties the extra `<h1>` to the substitution rather than to the layout.
    const corvusHeading = screen.getByRole('heading', { name: 'Corvus' })
    expect(corvusHeading.tagName).toBe('H1')
    expect(corvusHeading.getAttribute('data-slot')).toBe('agent-name')
  })
})

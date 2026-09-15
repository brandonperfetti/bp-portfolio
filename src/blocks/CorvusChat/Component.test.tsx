import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { CorvusChatBlockComponent } from '@/blocks/CorvusChat/Component'
import {
  CORVUS_CHAT_BLOCK_HEADING_LEVEL,
  CORVUS_CHAT_VARIANT_HEIGHT_CLASSES,
  corvusChatVariantHeightClass,
} from '@/blocks/CorvusChat/variants'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import type { Page } from '@/payload-types'

type LayoutBlock = NonNullable<Page['layout']>[number]

/**
 * #217 phase 1 — the `corvusChat` block's own contract: one `<h1>` per page,
 * a bounded frame, two blocks that do not interfere, and the #158/#179 modal
 * behaviour holding in the narrow-column shape the ticket calls out as
 * untested.
 *
 * @remarks `useChat` is stubbed (as in every Corvus suite but
 * `CorvusChat.starterPrompt.test.tsx`, which needs the real wire) so a stored
 * assistant reply can be put on screen without a network. `streamdown` is NOT
 * stubbed here: the dialog under test is the one OUR link component mounts, so
 * stubbing the renderer would assert nothing.
 */

type ChatState = {
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    parts: Array<{ type: 'text'; text: string }>
  }>
  sendMessage: ReturnType<typeof vi.fn>
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  error?: Error
}

const chatState: ChatState = {
  messages: [],
  sendMessage: vi.fn(),
  status: 'ready',
  error: undefined,
}

vi.mock('@ai-sdk/react', () => ({ useChat: () => chatState }))
vi.mock('ai', () => ({ DefaultChatTransport: vi.fn() }))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))
// `ColumnShell` imports ScrollReveal, which registers a GSAP plugin at module
// scope and reads `matchMedia` doing so; jsdom has neither. Render children
// directly, as `RenderBlocks.test.tsx` does.
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
// Server blocks reach the Payload config (unresolvable in jsdom); stub them,
// exactly as `RenderBlocks.test.tsx` does — this suite dispatches through the
// same module and so imports the same tree.
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
// GSAP + a live matchMedia read on mount; jsdom has neither. The heading
// block owes this dispatcher a tag and the text — the animation is asserted in
// the heading block's own stories, in a browser.
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

const assistantLinkMessage = {
  id: 'a1',
  role: 'assistant' as const,
  parts: [
    {
      type: 'text' as const,
      text: 'The docs are at [Vercel](https://vercel.com/docs).',
    },
  ],
}

const corvusChatBlock = (
  overrides: Partial<Extract<LayoutBlock, { blockType: 'corvusChat' }>> = {},
) =>
  ({
    blockType: 'corvusChat',
    variant: 'compact',
    ...overrides,
  }) as LayoutBlock

beforeEach(() => {
  chatState.messages = []
  chatState.sendMessage = vi.fn()
  chatState.status = 'ready'
  chatState.error = undefined
  Element.prototype.scrollTo = vi.fn()
})

describe('corvusChat block — document outline (#192 finding 2)', () => {
  it('leaves exactly one h1 on a page that already has one', () => {
    render(
      <RenderBlocks
        blocks={[
          {
            blockType: 'heading',
            text: 'Ask me anything',
            level: 'h1',
            variant: 'line',
          } as LayoutBlock,
          corvusChatBlock({ id: 'c1' }),
        ]}
      />,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    // …and Corvus's name is still a heading, one rank down.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Corvus' }),
    ).toBeTruthy()
  })

  it('dispatches the block at the level the block constant names, not at the component default', () => {
    // Ties the case above to the constant: the rendered rank IS
    // `CORVUS_CHAT_BLOCK_HEADING_LEVEL`, and that constant is not the
    // component's own default — so the block is doing the lowering.
    render(<RenderBlocks blocks={[corvusChatBlock({ id: 'c1' })]} />)

    const name = screen.getByRole('heading', { name: 'Corvus' })
    expect(name.tagName.toLowerCase()).toBe(CORVUS_CHAT_BLOCK_HEADING_LEVEL)
    expect(CORVUS_CHAT_BLOCK_HEADING_LEVEL).not.toBe('h1')
    // The counterfactual — flip that constant to `h1` and the page above gains
    // a second `<h1>` — lives in `Component.headingLevel.test.tsx`, which needs
    // its own file because `vi.mock` is hoisted and file-scoped.
  })

  it('renders the stored heading as the agent name, trimmed', () => {
    render(<CorvusChatBlockComponent variant="compact" heading="  Ask BP  " />)

    expect(
      screen.getByRole('heading', { level: 2, name: 'Ask BP' }),
    ).toBeTruthy()
  })
})

describe('corvusChat block — bounded frame (#217 AC "height comes from variant")', () => {
  it.each([
    ['compact', CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.compact],
    ['sidebar', CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.sidebar],
    ['full', CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.full],
  ] as const)('%s renders its own fixed height', (variant, heightClass) => {
    const { container } = render(<CorvusChatBlockComponent variant={variant} />)

    const section = container.querySelector('[data-slot="corvus-chat-block"]')
    expect(section?.className).toContain(heightClass)
    // Never a share of the viewport: that is the whole point of the variant
    // vocabulary, and the one property a future height value must not break.
    expect(section?.className).not.toMatch(/dvh|vh\]/)
  })

  it('falls back to the default height for an absent or stale stored value', () => {
    expect(corvusChatVariantHeightClass(undefined)).toBe(
      CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.compact,
    )
    expect(corvusChatVariantHeightClass('gigantic')).toBe(
      CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.compact,
    )
  })

  it('carries the Corvus skin itself rather than waiting for an ancestor', () => {
    const { container } = render(<CorvusChatBlockComponent variant="sidebar" />)

    expect(
      container.querySelector('[data-slot="corvus-chat-block"]')?.className,
    ).toContain('corvus-surface')
  })

  it('drops its outer rhythm inside a column, and keeps it at root', () => {
    const { container: root } = render(
      <CorvusChatBlockComponent variant="compact" hosted="root" />,
    )
    expect(
      root.querySelector('[data-slot="corvus-chat-block"]')?.className,
    ).toContain('my-12')

    const { container: column } = render(
      <CorvusChatBlockComponent variant="compact" hosted="column" />,
    )
    expect(
      column.querySelector('[data-slot="corvus-chat-block"]')?.className,
    ).not.toContain('my-12')
  })
})

describe('corvusChat block — two on one page do not interfere', () => {
  it('keeps composer state independent', async () => {
    render(
      <RenderBlocks
        blocks={[
          corvusChatBlock({ id: 'one', heading: 'First' }),
          corvusChatBlock({ id: 'two', heading: 'Second' }),
        ]}
      />,
    )

    const composers = screen.getAllByLabelText('Message Corvus')
    expect(composers).toHaveLength(2)

    await userEvent.type(composers[0], 'only in the first')

    expect(composers[0]).toHaveValue('only in the first')
    expect(composers[1]).toHaveValue('')
  })

  it('seeds each block from its OWN starterPrompt', () => {
    render(
      <RenderBlocks
        blocks={[
          corvusChatBlock({ id: 'one', starterPrompt: 'Ask about the stack' }),
          corvusChatBlock({
            id: 'two',
            starterPrompt: 'Ask about the writing',
          }),
        ]}
      />,
    )

    const composers = screen.getAllByLabelText('Message Corvus')
    expect(composers[0]).toHaveValue('Ask about the stack')
    expect(composers[1]).toHaveValue('Ask about the writing')
  })

  it('opens exactly one dialog, from the card whose link was clicked', async () => {
    chatState.messages = [assistantLinkMessage]
    render(
      <RenderBlocks
        blocks={[
          corvusChatBlock({ id: 'one' }),
          corvusChatBlock({ id: 'two' }),
        ]}
      />,
    )

    const cards = [
      ...document.querySelectorAll<HTMLElement>('[data-slot="chat-card"]'),
    ]
    expect(cards).toHaveLength(2)

    const triggers = screen.getAllByRole('button', { name: 'Vercel' })
    expect(cards[1].contains(triggers[1])).toBe(true)
    await userEvent.click(triggers[1])

    // One dialog, not two — each block owns its own dialog state.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('corvusChat block — #158/#179 modal behaviour in a NARROW column', () => {
  /**
   * `[source, #192 via #217]` "two cards on one page" is the tested shape;
   * a card inside a narrow column is not, so this is a new test rather than an
   * assumption. The shape is the real one: a `ColumnShell` at `third` width
   * inside a 12-track grid row, exactly as `container` → `column` renders it.
   */
  const renderInNarrowColumn = () =>
    render(
      <div className="grid grid-cols-12 gap-8">
        <ColumnShell size="oneThird" sticky>
          <CorvusChatBlockComponent variant="sidebar" hosted="column" />
        </ColumnShell>
        <ColumnShell size="twoThirds">
          <p>Article body</p>
        </ColumnShell>
      </div>,
    )

  it('takes the chat surface out of reach while the confirmation is open, and gives it back', async () => {
    chatState.messages = [assistantLinkMessage]
    renderInNarrowColumn()

    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))

    const surface = document.querySelector('[data-slot="chat-card"]')
    // Non-null FIRST: `surface?.closest(…)` on a missing surface is
    // `undefined`, which passes `.not.toBeNull()` vacuously.
    expect(surface).not.toBeNull()
    expect(surface?.closest('[aria-hidden="true"]')).not.toBeNull()
    // The dialog is portalled out of the column, which is what stops the
    // narrow rail from clipping or shrinking it.
    const dialog = screen.getByRole('dialog')
    expect(surface?.contains(dialog)).toBe(false)
    expect(
      document
        .querySelector('[data-slot="corvus-chat-block"]')
        ?.contains(dialog),
    ).toBe(false)

    await userEvent.keyboard('{Escape}')
    expect(surface?.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('renders the block inside the sticky rail it was dropped into', () => {
    renderInNarrowColumn()

    const rail = screen.getByTestId('cms-sticky-rail')
    expect(rail.className).toContain('lg:sticky')
    const block = within(rail).getByRole('heading', { level: 2 })
    expect(block.textContent).toBe('Corvus')
  })
})

describe('corvusChat block — the page-wide / shortcut (CodeRabbit #234)', () => {
  it('does not hijack the page-wide / shortcut', () => {
    // An editor can drop this block on any page, and `CorvusChat`'s `/`
    // listener is on `window` — on `/articles` it would steal the key
    // `ArticlesExplorer` owns for its filter field. The block releases it.
    render(<CorvusChatBlockComponent variant="full" heading="Corvus" />)

    fireEvent.keyDown(window, { key: '/' })

    expect(screen.getByLabelText('Message Corvus')).not.toHaveFocus()
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * #217 phase 1 AC: **`/corvus` renders byte-identically to today** — same
 * height frame, same `<h1>`, same skin — after `CorvusChat` gained
 * `headingLevel` and `starterPrompt`.
 *
 * @remarks Two halves, because "byte-identical" is a claim about two different
 * things and neither half proves the other:
 *
 * 1. **The page's own frame**, read out of `corvus/page.tsx` as source. The
 *    wrapper class string and the skin class are literals on that page, and the
 *    page is outside this change's fence — so this test's job is to fail the
 *    moment someone edits them, in either direction. It also pins the *call*:
 *    the page must keep passing `title` and `subtitle` and nothing else, since
 *    passing either new prop is exactly how the page's DOM would drift.
 * 2. **The component's default DOM**, rendered. With no new props the agent
 *    header must still be an `<h1>` carrying the same classes and
 *    `data-slot` — the inline snapshot is the byte-level half.
 *
 * The stronger receipt is outside the test suite and is stated for the record:
 * `git diff` reports zero changed lines in `corvus/page.tsx` for this change.
 * This test is what keeps that true next time.
 */

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
  usePrefersReducedMotion: () => true,
}))

const PAGE_SOURCE = readFileSync(
  path.join(process.cwd(), 'src/app/(frontend)/corvus/page.tsx'),
  'utf8',
)

/** The `/corvus` frame, character for character (`corvus/page.tsx:64`). */
const CORVUS_PAGE_WRAPPER_CLASS =
  'corvus-surface flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden rounded-3xl pt-8 pb-2 sm:h-[calc(100dvh-6.25rem)] sm:pt-10 sm:pb-3'

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn()
})

describe('/corvus is unchanged by the corvusChat block (#217 phase 1)', () => {
  it('keeps its viewport-derived height frame and its skin', () => {
    expect(PAGE_SOURCE).toContain(`className="${CORVUS_PAGE_WRAPPER_CLASS}"`)
    // The skin still comes from the PAGE here, which is the fact the block's
    // `.corvus-surface` decision is a departure from — stated so the two
    // cannot silently become one.
    expect(CORVUS_PAGE_WRAPPER_CLASS.startsWith('corvus-surface ')).toBe(true)
  })

  it('passes CorvusChat only title and subtitle — neither new prop', () => {
    expect(PAGE_SOURCE).toContain(
      '<CorvusChat title={headingText} subtitle={subtitleText} />',
    )
    expect(PAGE_SOURCE).not.toContain('headingLevel')
    expect(PAGE_SOURCE).not.toContain('starterPrompt')
  })

  it('renders the agent header as an h1 with the same DOM as before the prop existed', () => {
    render(<CorvusChat title="Corvus" subtitle="Prefix your prompt." />)

    const heading = screen.getByRole('heading', { level: 1, name: 'Corvus' })
    expect(heading.tagName).toBe('H1')
    expect(heading.outerHTML).toMatchInlineSnapshot(
      `"<h1 data-slot="agent-name" class="truncate text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Corvus</h1>"`,
    )
  })

  it('starts with an empty composer when no starter is supplied', () => {
    render(<CorvusChat title="Corvus" subtitle="Prefix your prompt." />)

    expect(screen.getByLabelText('Message Corvus')).toHaveValue('')
  })
})

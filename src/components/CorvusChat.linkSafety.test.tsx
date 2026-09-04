import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * #144 — citations into this site must not get the "external website" modal.
 *
 * @remarks Deliberately the ONE Corvus suite that does not mock `streamdown`.
 * `CorvusChat.test.tsx` stubs it to a plain `<div>` so the composer tests stay
 * fast, but the whole defect lives inside streamdown's own link component:
 * the default `linkSafety = { enabled: true }` renders every link as a
 * `<button>` that opens a confirmation modal. Stubbing the library out would
 * assert nothing about the fix. So this file drives the real one and measures
 * what a click actually does.
 *
 * What the real component does with an approved link (streamdown 2.5.0,
 * `dist/chunk-BO2N2NFS.js`): `onLinkCheck` returning `true` calls
 * `window.open(href, '_blank', 'noreferrer')` and returns before opening the
 * modal. Note that is streamdown's baseline for links in both branches — its
 * un-guarded anchor is also `target="_blank"` — so this change removes a
 * modal without changing where links open.
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

vi.mock('@ai-sdk/react', () => ({
  useChat: () => chatState,
}))
vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn(),
}))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

const assistantMessage = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{ type: 'text' as const, text }],
})

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL

/** streamdown's default modal, identified by its own hard-coded heading. */
const externalModal = () => screen.queryByText('Open external link?')

let openSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example-site.test'
  chatState.messages = []
  chatState.sendMessage = vi.fn()
  chatState.status = 'ready'
  chatState.error = undefined
  Element.prototype.scrollTo = vi.fn()
  openSpy = vi.fn()
  vi.stubGlobal('open', openSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL
  }
})

describe('CorvusChat link safety (#144)', () => {
  it('opens a site-relative citation without a confirmation modal', async () => {
    chatState.messages = [
      assistantMessage(
        'a1',
        'His stack is on the [tech page](/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    const link = screen.getByText('tech page')
    expect(externalModal()).toBeNull()

    await userEvent.click(link)

    // The defect: before this change, this click raised the modal.
    expect(externalModal()).toBeNull()
    expect(openSpy).toHaveBeenCalledWith('/tech', '_blank', 'noreferrer')
  })

  it('treats an absolute link on the site host as internal', async () => {
    chatState.messages = [
      assistantMessage(
        'a2',
        'See [the tech page](https://example-site.test/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByText('the tech page'))

    expect(externalModal()).toBeNull()
    expect(openSpy).toHaveBeenCalledWith(
      'https://example-site.test/tech',
      '_blank',
      'noreferrer',
    )
  })

  it('still confirms an off-site link, and does not navigate first', async () => {
    chatState.messages = [
      assistantMessage(
        'a3',
        'The docs are at [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByText('Vercel'))

    // Confirmation is preserved — this is why the fix is a predicate rather
    // than `linkSafety={{ enabled: false }}`.
    expect(externalModal()).not.toBeNull()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('shows the external modal naming only the off-site URL', async () => {
    chatState.messages = [
      assistantMessage(
        'a4',
        'Both: [tech](/tech) and [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByText('Vercel'))

    // Copy is accurate now that only genuinely external links reach it, which
    // is why no `renderModal` override ships with this fix.
    expect(
      screen.getByText("You're about to visit an external website."),
    ).toBeTruthy()
    expect(screen.getByText('https://vercel.com/docs')).toBeTruthy()
    expect(screen.queryByText('/tech')).toBeNull()
  })
})

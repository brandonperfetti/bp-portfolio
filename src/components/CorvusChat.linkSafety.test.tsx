import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * #144 then #158 — what a link in a Corvus reply actually is, and what a
 * click on it actually does.
 *
 * @remarks Deliberately the ONE Corvus suite that does not mock `streamdown`.
 * `CorvusChat.test.tsx` stubs it to a plain `<div>` so the composer tests stay
 * fast, but this behaviour is a negotiation with streamdown's own renderer:
 * the point is whether OUR link component is the one that mounts. Stubbing
 * the library out would assert nothing.
 *
 * #144 kept streamdown's `linkSafety` and used `onLinkCheck` to skip the modal
 * for internal links. That fixed the modal and left the rest: streamdown's
 * guarded link is a `<button>` in every branch, and an approved click ran
 * `window.open(href, '_blank', 'noreferrer')` — so `/tech` was neither an
 * inspectable anchor nor a same-tab navigation
 * `[measured, prod 2026-09-04, #158]`.
 *
 * #158 replaces the link component instead (`components.a`). Brandon's rule:
 * **internal links navigate in the same tab; only external links open a new
 * tab and keep the confirmation.** So the assertions below moved with it —
 * internal now asserts an `href` and a `router.push`, external still asserts
 * a confirmation and no navigation.
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
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
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

/** The confirmation dialog, identified by its heading (copy unchanged). */
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
  push.mockClear()
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

describe('CorvusChat internal citations (#158 AC1)', () => {
  it('renders a site-relative citation as a real anchor with its href', () => {
    chatState.messages = [
      assistantMessage(
        'a1',
        'His stack is on the [tech page](/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    // The #158 defect in one assertion: this used to be a `<button>` with the
    // href locked inside a click handler, so it could not be inspected,
    // hovered for a status-bar preview, middle-clicked, or copied.
    const link = screen.getByRole('link', { name: 'tech page' })
    expect(link.getAttribute('href')).toBe('/tech')
  })

  it('navigates in-app, in the SAME TAB, with no confirmation', async () => {
    chatState.messages = [
      assistantMessage(
        'a2',
        'His stack is on the [tech page](/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('link', { name: 'tech page' }))

    expect(externalModal()).toBeNull()
    expect(push).toHaveBeenCalledWith('/tech')
    // Brandon's rule, asserted as the negative it actually is: no new tab.
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('treats an absolute link on the site host as internal', async () => {
    chatState.messages = [
      assistantMessage(
        'a3',
        'See [the tech page](https://example-site.test/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('link', { name: 'the tech page' }))

    expect(externalModal()).toBeNull()
    expect(push).toHaveBeenCalledWith('https://example-site.test/tech')
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('leaves a modified click to the browser, so open-in-new-tab still works', async () => {
    chatState.messages = [
      assistantMessage(
        'a4',
        'His stack is on the [tech page](/tech).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    // `fireEvent`, not `userEvent`: each bare `userEvent.click` call builds a
    // fresh session, so a modifier held by a previous `userEvent.keyboard`
    // call is not carried into it — the click would arrive unmodified and the
    // assertion below would pass vacuously.
    fireEvent.click(screen.getByRole('link', { name: 'tech page' }), {
      metaKey: true,
    })

    // The router must NOT swallow it — a real `href` plus a default-action
    // click is what makes ⌘-click mean what the visitor expects.
    expect(push).not.toHaveBeenCalled()
  })
})

describe('CorvusChat external links (#158 AC2)', () => {
  it('still confirms an off-site link, and does not navigate first', async () => {
    chatState.messages = [
      assistantMessage(
        'b1',
        'The docs are at [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))

    expect(externalModal()).not.toBeNull()
    expect(openSpy).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows the confirmation naming only the off-site URL', async () => {
    chatState.messages = [
      assistantMessage(
        'b2',
        'Both: [tech](/tech) and [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))

    // Copy carried over verbatim from streamdown's modal: it was already
    // accurate for a genuinely off-site page, and #158 is not a redesign.
    expect(
      screen.getByText("You're about to visit an external website."),
    ).toBeTruthy()
    expect(screen.getByText('https://vercel.com/docs')).toBeTruthy()
    // The internal citation beside it is an anchor, and never named here.
    expect(screen.queryByText('/tech')).toBeNull()
  })

  it('opens the off-site link in a new tab only after confirmation', async () => {
    chatState.messages = [
      assistantMessage(
        'b3',
        'The docs are at [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Open link' }))

    expect(openSpy).toHaveBeenCalledWith(
      'https://vercel.com/docs',
      '_blank',
      'noreferrer',
    )
    expect(externalModal()).toBeNull()
  })

  it('cancelling neither navigates nor leaves the dialog open', async () => {
    chatState.messages = [
      assistantMessage(
        'b4',
        'The docs are at [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(openSpy).not.toHaveBeenCalled()
    expect(externalModal()).toBeNull()
  })
})

/**
 * #158 AC3, a11y half. streamdown's own modal put `role="button"` on the
 * backdrop and `role="presentation"` on the panel, moved focus nowhere, and
 * had no accessible name. The replacement is a real dialog; these assertions
 * are the floor it may not drop below.
 *
 * ## What jsdom CANNOT prove here, and where the proof lives
 *
 * **jsdom does not implement `inert` focusability.** In a real browser
 * `.focus()` on an element inside an inert subtree is a no-op; in jsdom it
 * succeeds. That gap produced a genuine false positive: an earlier version of
 * this component restored focus synchronously inside `close()`, while the chat
 * surface was still inert, and the "returns focus to the link" test below
 * passed green while `activeElement` stayed on `<body>` in Chromium
 * `[measured by review, 2026-09-04]`.
 *
 * The test is kept — it pins the intent and it catches a restore that is
 * removed altogether — but the **browser tier is the proof**: the
 * `ExternalLinkConfirmation` story in `CorvusChat.stories.tsx` closes the
 * dialog by Escape and by Cancel and asserts in real Chromium that focus lands
 * back on the originating link and the surface no longer carries `inert`.
 * Treat a green run here as necessary and not sufficient.
 */
describe('CorvusChat confirmation dialog a11y (#158 AC3)', () => {
  const openConfirmation = async () => {
    chatState.messages = [
      assistantMessage(
        'c1',
        'The docs are at [Vercel](https://vercel.com/docs).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)
    await userEvent.click(screen.getByRole('button', { name: 'Vercel' }))
  }

  it('is an accessibly-named modal dialog', async () => {
    await openConfirmation()

    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog).toHaveAccessibleName('Open external link?')
  })

  it('moves focus onto the confirming action when it opens', async () => {
    await openConfirmation()

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Open link' }),
    )
  })

  it('traps Tab: from the last focusable back to the first', async () => {
    await openConfirmation()

    const dialog = screen.getByRole('dialog')
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button')]
    // Sanity: the trap is only meaningful over more than one control, and a
    // wrong count here would make the cycling assertions below vacuous.
    expect(focusables.length).toBeGreaterThan(1)
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    await userEvent.tab()

    expect(document.activeElement).toBe(first)
  })

  it('traps Shift+Tab: from the first focusable back to the last', async () => {
    await openConfirmation()

    const dialog = screen.getByRole('dialog')
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button')]
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    first.focus()
    await userEvent.tab({ shift: true })

    expect(document.activeElement).toBe(last)
  })

  it('makes the chat surface behind it unreachable while open', async () => {
    // `docs/ACCESSIBILITY.md`: overlays trap and restore focus. A Tab trap
    // alone shuts only the keyboard door — `inert` also takes the composer,
    // the mic and every citation out of a screen reader's virtual cursor.
    await openConfirmation()

    const surface = document.querySelector('[data-slot="chat-card"]')
    expect(surface?.hasAttribute('inert')).toBe(true)
    // The composer is behind it, so it is inert too — asserted through the
    // surface rather than by tabbing, which the trap above already covers.
    expect(surface?.contains(screen.getByLabelText('Message Corvus'))).toBe(
      true,
    )
  })

  it('gives the surface back when the dialog closes', async () => {
    await openConfirmation()
    await userEvent.keyboard('{Escape}')

    expect(
      document.querySelector('[data-slot="chat-card"]')?.hasAttribute('inert'),
    ).toBe(false)
  })

  it('renders outside the chat card, so inert cannot swallow it', async () => {
    // The dialog lives inside the chat card in the React tree; portalling it
    // to `document.body` is what lets its own ancestor be marked inert.
    await openConfirmation()

    const surface = document.querySelector('[data-slot="chat-card"]')
    expect(surface?.contains(screen.getByRole('dialog'))).toBe(false)
  })

  it('closes on Escape and returns focus to the link that opened it', async () => {
    // NECESSARY, NOT SUFFICIENT — see this block's docblock. jsdom will let a
    // focus call inside an inert subtree succeed, so this cannot tell a
    // working restore from one that is ordered wrongly. The story does.
    await openConfirmation()

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Vercel' }),
    )
  })

  it('restores focus after Cancel too, not only after Escape', async () => {
    // All four close paths (Escape, Cancel, Confirm, backdrop) route through
    // one `close()`, so this is the cheap check that the shared path is the
    // shared path.
    await openConfirmation()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Vercel' }),
    )
  })
})

/**
 * #158 item (c). `mailto:`/`tel:` are not this site, so they keep a
 * confirmation — but #144's conservative choice was to show them the
 * "external website" copy, which `linkSafety.ts` documented as a known lie.
 * Owning the dialog is what makes telling the truth free.
 */
describe('CorvusChat hand-off schemes (#158 item c)', () => {
  it('tells a visitor a mailto: opens their email app', async () => {
    chatState.messages = [
      assistantMessage(
        'd1',
        'Write to [Brandon](mailto:brandon@example-site.test).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Brandon' }))

    expect(screen.getByText('Open your email app?')).toBeTruthy()
    expect(externalModal()).toBeNull()
  })

  it('hands a mailto: off in place rather than opening an empty tab', async () => {
    chatState.messages = [
      assistantMessage(
        'd2',
        'Write to [Brandon](mailto:brandon@example-site.test).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'Brandon' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Open email app' }),
    )

    expect(openSpy).toHaveBeenCalledWith(
      'mailto:brandon@example-site.test',
      '_self',
    )
  })

  it('tells a visitor a tel: starts a call', async () => {
    chatState.messages = [
      assistantMessage(
        'd3',
        'Call [the office](tel:+15550100).',
      ) as ChatState['messages'][number],
    ]
    render(<CorvusChat />)

    await userEvent.click(screen.getByRole('button', { name: 'the office' }))

    expect(screen.getByText('Start a phone call?')).toBeTruthy()
  })
})

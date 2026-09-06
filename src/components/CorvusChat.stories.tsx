import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import CorvusChat from '@/components/CorvusChat'

/**
 * Corvus chat surface (Vercel AI SDK). `Idle` renders the empty state —
 * intro, suggestions, and composer. `RateLimited` and `SignInRequired` stub
 * `fetch` to drive the chat route's two non-stream error responses (#74)
 * through the real `useChat` error branch, without a real backend.
 */
const meta = {
  title: 'AI/CorvusChat',
  component: CorvusChat,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CorvusChat>

export default meta
type Story = StoryObj<typeof meta>

/** Stubs the chat route's real `sign_in_required` 401 for the gate stories.
 *
 * @returns A restore closure that puts the original `window.fetch` back; call
 * it in a `finally` so one story's stub can never leak into the next.
 */
function stubSignInRequired() {
  const originalFetch = window.fetch
  window.fetch = (async () =>
    new Response(
      JSON.stringify({
        error:
          "You've used your free Corvus messages — sign in to keep chatting.",
        code: 'sign_in_required',
      }),
      { status: 401 },
    )) as typeof window.fetch
  return () => {
    window.fetch = originalFetch
  }
}

/**
 * Drives the chat to the sign-in gate and returns its CTA.
 *
 * @param canvasElement - The story root, from the play context.
 * @returns The gate's sign-in link, mounted and ready to interact with.
 */
async function reachSignInGate(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  const input = canvas.getByPlaceholderText('Ask Corvus...')
  await userEvent.type(input, 'One more question?')
  await userEvent.click(canvas.getByRole('button', { name: /send/i }))

  const cta = await canvas.findByRole('link', { name: /sign in to continue/i })
  return cta as HTMLAnchorElement
}

/**
 * Shown when a story bails out of its CSS-state assertions for want of a real
 * pointer, so a canvas run is visibly partial rather than silently weaker.
 */
const NO_REAL_POINTER =
  '[#139] Skipped the CSS-state assertions: they need the Vitest browser ' +
  'runner (`pnpm test:storybook`). The Storybook canvas has only a synthetic ' +
  'pointer, which cannot engage CSS `:hover`.'

/**
 * Whether this bundle was built by the Vitest Storybook runner, decided at
 * build time so the canvas build eliminates the `vitest/browser` import rather
 * than shipping the throwing module as an unreachable chunk.
 *
 * @remarks Tests DEFINEDNESS, not truth: under the runner the value is the
 * string `'false'`, truthy only by accident and no basis for a gate. In a
 * canvas build the key is absent, so this folds to `false` and the dynamic
 * import below is dropped entirely.
 */
const IS_VITEST_STORYBOOK_BUILD =
  typeof (import.meta.env as { VITEST_STORYBOOK?: string }).VITEST_STORYBOOK !==
  'undefined'

/**
 * Resolves Playwright's real `userEvent`, or `null` when there is no real
 * pointer to be had.
 *
 * @remarks `userEvent` from `storybook/test` dispatches synthetic
 * `pointerover`/`mouseover` events. Those drive React handlers fine, but they
 * do not move the browser's own pointer, so the element never enters the CSS
 * `:hover` state and rules like
 * `.corvus-surface [data-slot='sign-in-gate-cta']:hover` never match — which
 * is exactly how the #139 hover stories went red. `userEvent` from
 * `vitest/browser` is backed by Playwright's real mouse, so `:hover` engages
 * for real.
 *
 * It is loaded lazily and ONLY under the runner. `vitest/browser` resolves to
 * a module whose body is `export const userEvent = null` followed by a
 * top-level `throw` — importing it statically takes this whole story module
 * down everywhere else: `pnpm storybook` throws on import (killing all eight
 * CorvusChat stories, not just the hover ones), and `build-storybook` stays
 * green while tree-shaking the throw and folding the export to `null`, so the
 * built chunk ships `null.hover(...)`.
 *
 * Two different questions get two different mechanisms, deliberately:
 *
 * - "Could this bundle load it?" — {@link IS_VITEST_STORYBOOK_BUILD}, here.
 *   It must be statically foldable, or the canvas build emits the throwing
 *   module as a lazy chunk (measured: the throw string landed in
 *   `assets/context-*.js`).
 * - "Are we in the runner right now?" — {@link isVitestBrowserRunner}, a
 *   runtime fact no bundler can fold, used by the fail-closed branch in
 *   {@link hoverForReal}. It is kept OUT of this ternary on purpose: mixing it
 *   in was measured to defeat the folding above.
 *
 * `import.meta.env.VITEST` serves neither: it is **undefined** in browser mode
 * (Vitest sets `process.env.VITEST` in the Node process; the replacement never
 * reaches the browser client). Gating on it silently skipped every CSS-state
 * assertion in all three hover stories while the suite still reported 7/7 —
 * which is why the run output is now grepped for the skip string.
 *
 * @returns The real `userEvent`, or `null` outside the Vitest browser runner.
 */
let realUserEventPromise:
  Promise<{ hover(el: Element): Promise<void> } | null> | undefined
async function getRealUserEvent() {
  // The ternary is kept deliberately simple — a single statically-known
  // condition. Folding `A && isVitestBrowserRunner()` was measured NOT to
  // eliminate the import (rolldown keeps the chunk once the condition touches
  // a runtime call), which put the throwing module back in the canvas build.
  realUserEventPromise ??= IS_VITEST_STORYBOOK_BUILD
    ? import('vitest/browser').then((m) => m.userEvent)
    : Promise.resolve(null)
  return realUserEventPromise
}

/**
 * Whether this code is executing inside the Vitest browser runner, as opposed
 * to a Storybook canvas.
 *
 * @returns `true` under `pnpm test:storybook`.
 */
function isVitestBrowserRunner() {
  return (
    typeof (globalThis as { __vitest_browser_runner__?: unknown })
      .__vitest_browser_runner__ !== 'undefined'
  )
}

/**
 * Hovers `element` with a real pointer where one exists, and reports which
 * kind of hover actually happened.
 *
 * @remarks Fails CLOSED: under the runner a missing real pointer is a broken
 * harness, not a reason to relax. It throws rather than returning `false`, so
 * no story can ever report green under `pnpm test:storybook` without having
 * actually engaged CSS `:hover` — the exact failure this helper exists to
 * prevent, and one that has now been shipped twice by other means.
 *
 * @param element - The element to hover.
 * @returns `true` when a real pointer engaged CSS `:hover` (confirmed by
 * polling `matches(':hover')`, so a pointer that stops landing fails loudly
 * instead of letting a `.not.toContain(...)` assertion pass vacuously);
 * `false` only in a Storybook canvas, after the synthetic fallback, where the
 * caller must skip the CSS-state assertions.
 */
async function hoverForReal(element: HTMLElement) {
  const realUserEvent = await getRealUserEvent()
  if (realUserEvent) {
    await realUserEvent.hover(element)
    await waitFor(() => expect(element.matches(':hover')).toBe(true))
    return true
  }
  if (isVitestBrowserRunner()) {
    throw new Error(
      '[#139] The Vitest browser runner did not yield a real pointer. ' +
        'Refusing to continue: skipping the CSS-state assertions here would ' +
        'report green while proving nothing.',
    )
  }
  // Canvas only: still perform the interaction so the story plays through.
  await userEvent.hover(element)
  return false
}

/**
 * Reaches the sign-in gate, then hovers its CTA — the shared body of the
 * `#139` hover stories.
 *
 * @param canvasElement - The story root, from the play context.
 * @returns The CTA link, plus whether a real pointer engaged `:hover` (see
 * {@link hoverForReal}).
 */
async function hoverSignInGateCta(canvasElement: HTMLElement) {
  const cta = await reachSignInGate(canvasElement)
  const hovered = await hoverForReal(cta)
  return { cta, hovered }
}

/**
 * Tabs until the CTA holds focus, so the browser sets `:focus-visible` — a
 * programmatic `.focus()` does not, and `:focus-visible` is the discriminator
 * the dark hover rule keys on.
 *
 * @param cta - The gate's sign-in link.
 */
async function tabToSignInGateCta(cta: HTMLAnchorElement) {
  for (let i = 0; i < 20 && document.activeElement !== cta; i += 1) {
    await userEvent.tab()
  }
  await expect(cta).toHaveFocus()
}

/** The dark hover ring, `--corvus-accent-ring-hover` (teal-300) as rendered. */
const RING_RGB = 'rgb(94, 234, 212)'
/** `--corvus-accent` (teal-400), the focus outline colour on the dark surface. */
const FOCUS_RGB = 'rgb(45, 212, 191)'
/** `--corvus-accent-solid` (teal-700), the resting fill dark hover keeps. */
const RESTING_FILL_RGB = 'rgb(15, 118, 110)'
/** `--corvus-accent-solid-hover` (teal-800), the light theme's hover fill. */
const LIGHT_HOVER_FILL_RGB = 'rgb(17, 94, 89)'

/** Wraps a story in the `.corvus-surface` scope the gate CSS keys on. */
const withCorvusSurface: Decorator = (Story) => (
  <div className="corvus-surface rounded-3xl p-4">
    <Story />
  </div>
)

/**
 * Streams one assistant reply containing an internal citation and an off-site
 * link, through the real `useChat` transport (#158).
 *
 * @remarks A hand-built UI message stream rather than a mocked `useChat`,
 * because the thing under test is streamdown's rendering of a reply and the
 * component override that replaces its link component — a stubbed hook would
 * render the markdown and prove nothing about the wiring. The frames and
 * headers are the AI SDK's own v1 UI-message-stream protocol (`ai` 6.0.234,
 * `UI_MESSAGE_STREAM_HEADERS`), so this is the shape `/api/ai/chat` really
 * returns.
 *
 * @returns A restore closure that puts the original `window.fetch` back.
 */
function stubAssistantReply(markdown: string) {
  const originalFetch = window.fetch
  const frames = [
    { type: 'start' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: markdown },
    { type: 'text-end', id: 't1' },
    { type: 'finish' },
  ]
  const body = `${frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')}data: [DONE]\n\n`

  window.fetch = (async () =>
    new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    })) as typeof window.fetch
  return () => {
    window.fetch = originalFetch
  }
}

export const Idle: Story = {}

/**
 * #158: the external-link confirmation, open.
 *
 * @remarks The story exists so the a11y addon gates this dialog — it is new
 * UI, and `CLAUDE.md` requires new UI to carry a story for exactly that
 * reason. It is also the only surface in the repo that hand-rolls a modal:
 * there is no dialog primitive in `src/components/ui` and
 * `@radix-ui/react-dialog` is not a dependency, so nothing else is enforcing
 * its `role`/`aria-modal`/focus behaviour at the component level.
 *
 * The play function asserts what the unit tests cannot: that in a REAL
 * browser, with a real focus model, opening the dialog moves focus into it,
 * takes the chat surface behind it out of reach, and — the half jsdom is
 * blind to — **gives focus back on close**.
 *
 * That last one is not hypothetical coverage. jsdom does not implement `inert`
 * focusability, so a `.focus()` inside an inert subtree succeeds there and is a
 * no-op in Chromium; an earlier version of this component restored focus
 * synchronously in `close()` while the surface was still inert, and the jsdom
 * test passed while `activeElement` stayed on `<body>` in a real browser
 * `[measured by review, 2026-09-04]`. This story is the measurement that
 * catches that class of bug, so both close paths are exercised: Escape, and
 * Cancel.
 */
export const ExternalLinkConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const restoreFetch = stubAssistantReply(
      'His stack is on the [tech page](/tech), and the docs are at [Vercel](https://vercel.com/docs).',
    )
    try {
      const canvas = within(canvasElement)
      await userEvent.type(
        canvas.getByPlaceholderText('Ask Corvus...'),
        'Where are the docs?',
      )
      await userEvent.click(canvas.getByRole('button', { name: /send/i }))

      // The internal citation is a real anchor; the off-site link is a button
      // that asks first. That pair IS #158.
      const citation = await canvas.findByRole('link', { name: 'tech page' })
      await expect(citation).toHaveAttribute('href', '/tech')
      const offSite = await canvas.findByRole('button', { name: 'Vercel' })

      await userEvent.click(offSite)

      // Portalled to document.body, so it is outside the story canvas —
      // queried from the document, which is also what proves the portal.
      const dialog = await screen.findByRole('dialog')
      await expect(dialog).toHaveAttribute('aria-modal', 'true')
      await expect(dialog).toHaveAccessibleName('Open external link?')
      await expect(
        screen.getByRole('button', { name: 'Open link' }),
      ).toHaveFocus()

      // The surface behind it is inert, so nothing in the chat is reachable.
      const surface = canvasElement.querySelector('[data-slot="chat-card"]')
      await expect(surface).toHaveAttribute('inert')
      await expect(surface?.contains(dialog)).toBe(false)

      // ESCAPE: the surface comes back, and focus lands on the link that
      // opened the dialog — not on `<body>`. Both halves matter, and in this
      // order: focusing before `inert` is removed is silently a no-op, which
      // is exactly the regression this asserts against.
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await expect(surface).not.toHaveAttribute('inert')
      await expect(offSite).toHaveFocus()

      // CANCEL: the same contract through a different close path. All four
      // (Escape, Cancel, Confirm, backdrop) share one `close()`, so covering
      // two of them covers the shared ordering.
      await userEvent.click(offSite)
      await screen.findByRole('dialog')
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      await expect(surface).not.toHaveAttribute('inert')
      await expect(offSite).toHaveFocus()
    } finally {
      restoreFetch()
    }
  },
}

/**
 * Interaction: typing lands in the composer, and the retained v3 nicety —
 * an empty submit doesn't fire a request, it refocuses the textarea.
 */
export const ComposerInteractions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByPlaceholderText('Ask Corvus...')
    const send = canvas.getByRole('button', { name: /send/i })

    // Empty submit: no navigation/request — focus returns to the input.
    await userEvent.click(send)
    await waitFor(() => expect(input).toHaveFocus())

    // Typing lands in the composer.
    await userEvent.type(input, 'What does Brandon build?')
    await expect(input).toHaveValue('What does Brandon build?')
    await expect(send).toBeEnabled()
  },
}

/**
 * Rate-limit error state (existing `checkChatLimits` 429 branch, #74's
 * regression bar). The play function stubs `fetch` to return the route's
 * real 429 shape so `useChat`'s transport throws the same `Error` it would
 * in production (`new Error(await response.text())`), driving CorvusChat's
 * own error-branch matching rather than a hand-rolled mock of `useChat`.
 */
export const RateLimited: Story = {
  play: async ({ canvasElement }) => {
    const originalFetch = window.fetch
    window.fetch = (async () =>
      new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }),
        { status: 429 },
      )) as typeof window.fetch

    try {
      const canvas = within(canvasElement)
      const input = canvas.getByPlaceholderText('Ask Corvus...')
      await userEvent.type(input, 'How many messages do I get?')
      await userEvent.click(canvas.getByRole('button', { name: /send/i }))

      const alert = await canvas.findByRole('alert')
      await expect(alert).toHaveTextContent(/rate limit/i)
    } finally {
      window.fetch = originalFetch
    }
  },
}

/**
 * Auth soft-gate state (#74, folds #18): the anon free-message ceiling has
 * been hit. Stubs `fetch` to return the chat route's real
 * `{ code: 'sign_in_required' }` 401 shape. Renders as a friendly on-brand
 * prompt — never `role="alert"` — with a working Clerk sign-in link, and
 * disables the composer so a fourth attempt can't be typed while gated.
 * Static markup (no animation), so this state needs no separate
 * reduced-motion variant.
 */
export const SignInRequired: Story = {
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const canvas = within(canvasElement)
      const signInLink = await reachSignInGate(canvasElement)
      await expect(signInLink).toHaveAttribute(
        'href',
        expect.stringContaining('/sign-in?redirect_url='),
      )
      await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
      await expect(canvas.getByRole('button', { name: /send/i })).toBeDisabled()
      await expect(canvas.getByLabelText('Message Corvus')).toBeDisabled()
    } finally {
      restoreFetch()
    }
  },
}

/**
 * #139, dark: inside `.corvus-surface` the gate CTA's hover keeps its resting
 * teal-700 fill and gains a teal-300 ring instead. No teal fill step can hold
 * the white label at 4.5:1 AND the button's own edge at 3:1 against the
 * near-black gate panel at the same time; the ring measures 3.70:1 against the
 * fill and 13.38:1 against the panel, so both of its edges clear 1.4.11.
 */
export const SignInGateHoverDark: Story = {
  globals: { theme: 'dark' },
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const { cta, hovered } = await hoverSignInGateCta(canvasElement)
      if (!hovered) return console.warn(NO_REAL_POINTER)

      // The ring is present — polled, not sampled: the dark CTA carries
      // `transition: box-shadow 150ms ease-out`, so the first frame after the
      // pointer lands still reads the transition's start value
      // (`rgba(0, 0, 0, 0) 0px 0px 0px 0px`). Poll rather than sleep a fixed
      // number of ms, so the assertion is neither flaky nor slower than the
      // transition actually is.
      await waitFor(() =>
        expect(getComputedStyle(cta).boxShadow).toContain(RING_RGB),
      )
      // …and the fill did NOT step to teal-800.
      await expect(getComputedStyle(cta).backgroundColor).toBe(RESTING_FILL_RGB)
    } finally {
      restoreFetch()
    }
  },
}

/**
 * #139, dark, keyboard path: the rule's discriminator is
 * `:hover:not(:focus-visible)`, so the one state worth pinning is
 * focused **and** hovered at once — a keyboard user whose pointer happens to
 * rest on the control. Exactly one indicator must show, and it must be the
 * focus outline: a hover ring drawn over the focus ring is how a focus
 * indicator quietly goes missing (WCAG 2.4.7).
 */
export const SignInGateHoverDarkKeyboardFocus: Story = {
  globals: { theme: 'dark' },
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const cta = await reachSignInGate(canvasElement)

      // Hover FIRST, and prove the ring really draws on this element in this
      // theme. Without this half the `.not.toContain(RING_RGB)` below is
      // vacuous — it also passes when hover simply never engaged, which is
      // precisely the bug that hid behind the synthetic pointer.
      const hovered = await hoverForReal(cta)
      if (hovered) {
        await waitFor(() =>
          expect(getComputedStyle(cta).boxShadow).toContain(RING_RGB),
        )
      } else {
        console.warn(NO_REAL_POINTER)
      }

      // Now move focus onto the CTA without moving the pointer, so it is
      // focus-visible AND (under the runner) hovered at once.
      // `userEvent.tab()` is synthetic, and whether that lands as
      // `:focus-visible` rides on Chromium's last-interaction heuristic —
      // which a real pointer PRESS would reset, though the hover above does
      // not. Hence the assertion rather than the assumption: if that ever
      // changes, this fails loudly instead of quietly testing the unfocused
      // state.
      await tabToSignInGateCta(cta)
      await expect(cta.matches(':focus-visible')).toBe(true)

      // The focus outline is what is showing. These need no real pointer, so
      // they hold on BOTH paths — they are the assertions this story had
      // before #139 and must not disappear behind a canvas skip.
      const style = getComputedStyle(cta)
      await expect(style.outlineColor).toBe(FOCUS_RGB)
      await expect(style.outlineStyle).toBe('solid')
      await expect(parseFloat(style.outlineWidth)).toBeGreaterThan(0)
      // The fill still does not step, focused or not.
      await expect(style.backgroundColor).toBe(RESTING_FILL_RGB)

      if (hovered) {
        // Focused AND hovered at once: the ring is withdrawn, so there is
        // exactly one indicator. Polled for the same reason it was polled on
        // the way in — the ring transitions out over 150ms.
        await expect(cta.matches(':hover')).toBe(true)
        await waitFor(() =>
          expect(getComputedStyle(cta).boxShadow).not.toContain(RING_RGB),
        )
      }
    } finally {
      restoreFetch()
    }
  },
}

/**
 * #139, light: unchanged. The gate CTA still hovers to the darker teal-800
 * fill, which on the light gate panel clears both floors (label 7.58:1, fill
 * edge 6.90:1) — the residual only ever existed against the dark panel.
 */
export const SignInGateHoverLight: Story = {
  globals: { theme: 'light' },
  decorators: [withCorvusSurface],
  play: async ({ canvasElement }) => {
    const restoreFetch = stubSignInRequired()
    try {
      const { cta, hovered } = await hoverSignInGateCta(canvasElement)
      if (!hovered) return console.warn(NO_REAL_POINTER)

      // teal-800 fill step (polled — the light rule has no transition, but a
      // hover style is a rendered style, so read it the same way), and no
      // hover ring. The fill step is itself the proof hover engaged, so the
      // `.not.toContain` below cannot pass vacuously.
      await waitFor(() =>
        expect(getComputedStyle(cta).backgroundColor).toBe(
          LIGHT_HOVER_FILL_RGB,
        ),
      )
      await expect(getComputedStyle(cta).boxShadow).not.toContain(RING_RGB)
    } finally {
      restoreFetch()
    }
  },
}

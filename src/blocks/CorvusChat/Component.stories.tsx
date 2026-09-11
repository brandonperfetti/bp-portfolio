import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'

import { ColumnShell } from '@/blocks/Column/ColumnShell'
import { CorvusChatBlockComponent } from '@/blocks/CorvusChat/Component'
import {
  CORVUS_CHAT_BLOCK_HEADING_LEVEL,
  CORVUS_CHAT_VARIANT_HEIGHT_CLASSES,
} from '@/blocks/CorvusChat/variants'

/**
 * The `corvusChat` page-builder block (#217 phase 1) — Corvus as something an
 * editor drops onto a page rather than a route of its own.
 *
 * ## The `.corvus-surface` decision: **the block carries the skin itself**
 *
 * The question the ticket asks is whether a placed Corvus should look like
 * Corvus, or like whatever page it landed on. It looks like Corvus, and these
 * stories are the evidence: none of them is wrapped in a `.corvus-surface`
 * decorator, and every one of them renders skinned.
 *
 * The argument, recorded here because this is where Brandon reads it:
 *
 * - `[measured, #217 prerequisite]` "Inherit it" is not a second look, it is no
 *   look. The only element on the site that applies `.corvus-surface` is
 *   `/corvus`'s own page wrapper; the page builder never puts one above a
 *   block, and the column-hosted probe duly rendered the plain zinc/teal
 *   component default.
 * - A CMS block whose appearance depends on where it was dropped is
 *   non-deterministic by construction — the same block in two columns of one
 *   page could read as two different products.
 * - `[source, src/styles/tailwind.css]` The skin is safely nestable and paints
 *   no ground: `.corvus-surface` declares custom properties plus `color-scheme`
 *   and an inherited `color`, and its descendant rules are all
 *   `data-slot`-scoped. The chat card is explicitly
 *   `background-color: transparent` — "a border on the page with no fill" — so
 *   the block sits on the page's own background, and nesting it inside
 *   `/corvus`'s wrapper would change nothing.
 * - The AA floors are pinned **on this surface**
 *   (`src/styles/corvus-accent-contrast.test.ts` asserts all four
 *   accent-on-Corvus ratios from source). Both skins clear AA today; only one
 *   has a test that says so.
 *
 * The cost, stated plainly: this changes chrome (bubble fills, avatar
 * gradient, panel tints, borders), not hue — Corvus is already aligned to the
 * site's teal/zinc palette. If a future surface wants an unskinned Corvus,
 * that is a new named variant, not a silent consequence of placement.
 *
 * ## Heading level
 *
 * The block renders Corvus's name at `h2` in **both** host contexts. A column
 * is not a section — `ColumnShell` renders no heading and `container` has no
 * heading field — so an `h3` here would skip a level on any page without an
 * `h2` above it. `h2` is the only rank that can never be a skip below a page's
 * `h1`.
 */
const meta = {
  title: 'Blocks/CorvusChat',
  component: CorvusChatBlockComponent,
  parameters: { layout: 'fullscreen' },
  args: { variant: 'compact' },
} satisfies Meta<typeof CorvusChatBlockComponent>

export default meta
type Story = StoryObj<typeof meta>

/** Root-hosted, `compact` — 24rem/384px, the block's default. */
export const Compact: Story = {
  args: { variant: 'compact', heading: 'Corvus' },
}

/** Root-hosted, `sidebar` — 32rem/512px. */
export const Sidebar: Story = {
  args: {
    variant: 'sidebar',
    heading: 'Corvus',
    starterPrompt: 'What has Brandon built with Payload?',
  },
}

/** Root-hosted, `full` — 44rem/704px, still not viewport-derived. */
export const Full: Story = {
  args: { variant: 'full', heading: 'Corvus' },
}

/** The same block in dark theme — light/dark parity is an acceptance criterion. */
export const SidebarDark: Story = {
  globals: { theme: 'dark' },
  args: { variant: 'sidebar', heading: 'Corvus' },
}

/**
 * Column-hosted: a real `ColumnShell` in a real 12-track grid row, beside a
 * body column. The block drops its `my-12` here (the column stack owns the
 * rhythm) and keeps its own height.
 */
export const ColumnHosted: Story = {
  args: { variant: 'sidebar', heading: 'Corvus' },
  render: (args) => (
    <div className="grid grid-cols-12 gap-8">
      <ColumnShell size="twoThirds">
        <h1 className="text-2xl font-bold">An article with a Corvus rail</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The page keeps its own single <code>h1</code>; the block&apos;s agent
          name renders one rank down.
        </p>
      </ColumnShell>
      <ColumnShell size="oneThird">
        <CorvusChatBlockComponent {...args} hosted="column" />
      </ColumnShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await expect(
      canvas.getByRole('heading', {
        level: Number(CORVUS_CHAT_BLOCK_HEADING_LEVEL.slice(1)),
        name: 'Corvus',
      }),
    ).toBeInTheDocument()
  },
}

/**
 * Whether this bundle was built by the Vitest Storybook runner, decided at
 * build time so the canvas build eliminates the `vitest/browser` import rather
 * than shipping the throwing module as an unreachable chunk.
 *
 * @remarks The mechanism and the reasoning are `CorvusChat.stories.tsx`'s —
 * `vitest/browser` resolves to a module whose body is a top-level `throw`
 * outside the runner, so it must be statically foldable away. Tests
 * DEFINEDNESS, not truth.
 */
const IS_VITEST_STORYBOOK_BUILD =
  typeof (import.meta.env as { VITEST_STORYBOOK?: string }).VITEST_STORYBOOK !==
  'undefined'

/** Cached lazy handle on the runner's `page`, or `null` in a canvas. */
let browserPagePromise:
  | Promise<{ viewport(width: number, height: number): Promise<void> } | null>
  | undefined

/**
 * Resolves the Vitest browser runner's `page` handle, which is the only way to
 * pin the iframe to a real viewport size.
 *
 * @returns The runner's `page`, or `null` in a Storybook canvas.
 */
async function getBrowserPage() {
  browserPagePromise ??= IS_VITEST_STORYBOOK_BUILD
    ? import('vitest/browser').then((m) => m.page)
    : Promise.resolve(null)
  return browserPagePromise
}

/**
 * Whether this code is executing inside the Vitest browser runner, as opposed
 * to a Storybook canvas.
 *
 * @remarks A runtime fact no bundler can fold, and deliberately a DIFFERENT
 * mechanism from {@link IS_VITEST_STORYBOOK_BUILD}: that one answers "could
 * this bundle load `vitest/browser`?" and must stay statically foldable, this
 * one answers "are we in the runner right now?". The pair, and the reason they
 * must not be merged into one condition, are `CorvusChat.stories.tsx`'s.
 *
 * @returns `true` under `pnpm test:storybook`.
 */
function isVitestBrowserRunner() {
  return (
    typeof (globalThis as { __vitest_browser_runner__?: unknown })
      .__vitest_browser_runner__ !== 'undefined'
  )
}

/** Shown when the measured story cannot get a real viewport to measure at. */
const NO_REAL_VIEWPORT =
  '[#217] Skipped the measured scroll-owner assertions: they need the Vitest ' +
  'browser runner (`pnpm storybook` cannot pin the iframe to 1440x900).'

/**
 * Pins the iframe to {@link MEASURED_VIEWPORT}, or says why it could not.
 *
 * @remarks **Fails CLOSED**, the convention `docs/TESTING.md` states and
 * `CorvusChat.stories.tsx`'s `hoverForReal` implements: under the runner a
 * missing `page` handle is a broken harness, not a reason to relax. It throws
 * rather than returning `false`, so this story can never report green under
 * `pnpm test:storybook` without having actually measured — a manual grep of the
 * run output for the skip string is not a gate, and treating it as one is how a
 * measured AC quietly becomes a no-op.
 *
 * @returns `true` once the viewport is pinned; `false` only in a Storybook
 * canvas, where the caller must skip the measured assertions.
 */
async function pinMeasuredViewport() {
  const page = await getBrowserPage()
  if (page) {
    await page.viewport(MEASURED_VIEWPORT.width, MEASURED_VIEWPORT.height)
    await waitFor(() => expect(window.innerWidth).toBe(MEASURED_VIEWPORT.width))
    return true
  }
  if (isVitestBrowserRunner()) {
    throw new Error(
      '[#217] The Vitest browser runner did not yield a page handle. ' +
        'Refusing to continue: skipping the measured scroll-owner assertions ' +
        'here would report green while proving nothing.',
    )
  }
  return false
}

/** The measured AC's viewport. */
const MEASURED_VIEWPORT = { width: 1440, height: 900 }

/** How much conversation content the AC injects. */
const INJECTED_CONTENT_PX = 1500

/**
 * Appends `INJECTED_CONTENT_PX` of conversation content, the way the #217
 * prerequisite harness did — a plain block of known height inside
 * `[data-slot='conversation-content']`.
 *
 * @param root - The story canvas.
 * @returns A promise that resolves once layout has settled.
 */
async function injectConversationContent(root: HTMLElement) {
  const content = root.querySelector<HTMLElement>(
    '[data-slot="conversation-content"]',
  )
  if (!content) throw new Error('No conversation content region to inject into')
  const filler = document.createElement('div')
  filler.dataset.probe = 'injected'
  filler.style.height = `${INJECTED_CONTENT_PX}px`
  content.appendChild(filler)
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await new Promise((resolve) => requestAnimationFrame(resolve))
}

/**
 * Every ancestor of `element` up to `<body>` that has overflowing content it
 * could scroll — i.e. the elements competing to own the scroll.
 *
 * @param element - The element to walk up from (exclusive).
 * @returns The overflowing ancestors, innermost first.
 */
function overflowingAncestors(element: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  let node = element.parentElement
  while (node && node !== document.body) {
    // 1px of slack: sub-pixel layout can leave a rounding difference that is
    // not a scroll region.
    if (node.scrollHeight - node.clientHeight > 1) out.push(node)
    node = node.parentElement
  }
  return out
}

/**
 * **The measured AC** (#217, as amended by the prerequisite run): the
 * `sidebar` variant in a sticky half column at 1440×900, with ≥1500px of
 * conversation content injected.
 *
 * @remarks Three assertions, and one regression guard:
 *
 * 1. `[data-slot='conversation']` reports `scrollHeight > clientHeight` — it
 *    has a bounded region and content that overflows it.
 * 2. It is the element that **owns** the scroll: no ancestor between it and
 *    `<body>` has overflowing content, so the growth is absorbed there and
 *    nowhere else. `[measured baseline, #217 prerequisite]` column-hosted
 *    today gives `clientHeight === scrollHeight === 1713` and **zero** scroll
 *    owners on the page.
 * 3. The block root's `offsetHeight` is **invariant** under content growth —
 *    the measurable form of "height comes from `variant`". Baseline: the
 *    column-hosted root grew 367px → 1883px.
 * 4. **Regression guard, not new work:** the rail still pins at `top: 40px`
 *    with its bottom inside the viewport. `[measured]` this already passed
 *    before this change, with the viewport-derived height — the prerequisite
 *    run falsified the design doc's "a ~100dvh rail has no travel" claim. It is
 *    here to catch a regression, and is labelled as one.
 */
export const SidebarInStickyHalfColumn: Story = {
  args: { variant: 'sidebar', heading: 'Corvus' },
  render: (args) => (
    <div className="grid grid-cols-12 gap-8">
      <ColumnShell size="half">
        {/* `aria-hidden`: the tall neighbour exists to make the row scroll, so
            it is decoration. Marking it so is what lets this story keep the
            a11y run ON — the sticky-half-column shape is the one the ticket
            cares about, and leaving it unchecked would be the only
            a11y-exempt surface in the block. */}
        <div
          aria-hidden="true"
          data-probe="filler"
          className="h-[3000px] rounded-2xl bg-zinc-100 dark:bg-zinc-800"
        >
          <p className="p-4 text-sm text-zinc-500">
            Tall neighbour — 3000px, so the row scrolls.
          </p>
        </div>
      </ColumnShell>
      <ColumnShell size="half" sticky>
        <CorvusChatBlockComponent {...args} hosted="column" />
      </ColumnShell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Fails CLOSED under the runner — see `pinMeasuredViewport`. The canvas is
    // the only tier allowed to skip, and it says so out loud.
    if (!(await pinMeasuredViewport())) {
      console.warn(NO_REAL_VIEWPORT)
      return
    }

    const block = canvasElement.querySelector<HTMLElement>(
      '[data-slot="corvus-chat-block"]',
    )
    await expect(block).not.toBe(null)
    const region = block!.querySelector<HTMLElement>(
      '[data-slot="conversation"]',
    )
    await expect(region).not.toBe(null)

    // The frame is the variant's, and it is a real number of pixels rather
    // than a share of the viewport.
    await expect(block!.className).toContain(
      CORVUS_CHAT_VARIANT_HEIGHT_CLASSES.sidebar,
    )
    const heightBefore = block!.offsetHeight
    await expect(heightBefore).toBe(512) // 32rem

    await injectConversationContent(canvasElement)

    // 1. The conversation overflows its own bounded region.
    await waitFor(() =>
      expect(region!.scrollHeight).toBeGreaterThan(region!.clientHeight),
    )
    await expect(region!.scrollHeight - region!.clientHeight).toBeGreaterThan(
      INJECTED_CONTENT_PX - region!.clientHeight,
    )
    // …and it is actually scrollable, not merely overflowing.
    await expect(['auto', 'scroll']).toContain(
      getComputedStyle(region!).overflowY,
    )

    // 2. It OWNS the scroll: nothing between it and <body> also overflows.
    await expect(
      overflowingAncestors(region!).map(
        (el) => el.dataset.slot ?? el.tagName.toLowerCase(),
      ),
    ).toEqual([])

    // 3. The block's own height did not move.
    await expect(block!.offsetHeight).toBe(heightBefore)

    // 4. Regression guard (passed before this change too): the rail pins at
    // top: 40px and its bottom stays inside the viewport.
    const rail = canvasElement.querySelector<HTMLElement>(
      '[data-testid="cms-sticky-rail"]',
    )
    await expect(rail).not.toBe(null)
    window.scrollTo(0, 800)
    await waitFor(() =>
      expect(Math.round(rail!.getBoundingClientRect().top)).toBe(40),
    )
    await expect(rail!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      MEASURED_VIEWPORT.height,
    )
    window.scrollTo(0, 0)
  },
}

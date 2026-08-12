import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import type { ResolvedSocialLink } from '@/blocks/SocialLinks/platforms'
import { HeroView } from '@/heros/HeroView'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS,
} from '@/heros/presentation'
import type { Page } from '@/payload-types'

const richText = {
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'Everything below the headline is ordinary server-rendered HTML — the canvas is decoration.',
          },
        ],
      },
    ],
  },
}

/** A page doc shaped like the admin writes it, for one hero configuration. */
const page = (hero: Record<string, unknown>): Page =>
  ({
    id: 1,
    title: 'Working together',
    subtitle:
      'Product and project management, plus the engineering to back it up.',
    slug: 'working-together',
    hero: { richText, ...hero },
  }) as unknown as Page

/**
 * The same doc with no hero prose — the shape Home has (title, subtitle and
 * nothing else), so a spacing assertion measures the gap it claims to.
 */
const pageWithoutProse = (hero: Record<string, unknown>): Page =>
  ({ ...page(hero), hero }) as unknown as Page

/**
 * The Identity global's `sameAs` list after `RenderHero` resolves it — the
 * real profiles the homepage links to today, so the icon-row stories show the
 * row a migrated Home would render.
 */
const identitySocialLinks: ResolvedSocialLink[] = [
  {
    href: 'https://x.com/brandonperfetti',
    label: 'Follow on X',
    platform: 'x',
  },
  {
    href: 'https://github.com/brandonperfetti',
    label: 'Follow on GitHub',
    platform: 'github',
  },
  {
    href: 'https://www.linkedin.com/in/brandonperfetti/',
    label: 'Follow on LinkedIn',
    platform: 'linkedin',
  },
]

/**
 * The decorative canvas frame, whichever presentation drew it — a direct
 * child of the hero `<header>`, which is what tells it apart from the
 * `aria-hidden` word spans `AnimatedHeadline` renders inside the headline.
 */
const canvasFrame = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('header > [aria-hidden="true"]')

/**
 * The CMS page hero — one group, three types, and (for the shader type) two
 * presentations. Stories are the type × presentation matrix; the route wraps
 * this in `<Container className="mt-16 sm:mt-32">`, which the decorator
 * mirrors so the full-bleed escape is visible rather than theoretical.
 *
 * @remarks Without WebGPU (most CI runs) the shader stories show the static
 * gradient fallback — that fallback is itself an acceptance criterion.
 */
const meta = {
  title: 'Heros/HeroView',
  component: HeroView,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      // Stand-in for the whole route chain, mirrored element for element
      // because the full-bleed hero's geometry *and* its stacking both depend
      // on it: the Layout's page panel as a positioned sibling (not an
      // ancestor background — that distinction is what makes a lost
      // `isolate` visible here), the content column, a 64px site header,
      // then `Container` as `src/components/Container.tsx` builds it, carrying
      // the `[slug]` route's `mt-16 sm:mt-32` and its load-bearing `isolate`.
      <div className="relative min-h-[40rem] overflow-hidden">
        <div
          data-page-panel
          className="absolute inset-0 bg-white dark:bg-zinc-900"
        />
        <div className="relative flex w-full flex-col">
          <div className="h-16" />
          <div
            className={`mt-16 sm:mt-32 sm:px-8 ${HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS}`}
          >
            <div className="mx-auto w-full max-w-7xl lg:px-8">
              <div className="relative px-4 sm:px-8 lg:px-12">
                <div className="mx-auto max-w-2xl lg:max-w-5xl">
                  <Story />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof HeroView>

export default meta
type Story = StoryObj<typeof meta>

/** `type: none` — the SimpleLayout look: headline, subtitle, no background. */
export const TypeNone: Story = {
  args: { page: page({ type: 'none' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Working together' }),
    ).toBeVisible()
    await expect(canvasFrame(canvasElement)).toBeNull()
  },
}

/** `type: standard` — hero text above the uploaded hero media. */
export const TypeStandard: Story = {
  args: {
    page: page({
      type: 'standard',
      media: {
        id: 1,
        url: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg',
        alt: 'Desk with a laptop and notebook',
        width: 1600,
        height: 900,
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('img', { name: 'Desk with a laptop and notebook' }),
    ).toBeVisible()
    await expect(canvasFrame(canvasElement)).toBeNull()
  },
}

/**
 * `type: shader, presentation: fullBleed` — the homepage treatment: the
 * canvas climbs out of the route container to the panel edges and up behind
 * the header, with the legibility scrim and the fade into the page below.
 */
export const ShaderFullBleed: Story = {
  args: { page: page({ type: 'shader', presentation: 'fullBleed' }) },
  play: async ({ canvasElement }) => {
    const frame = canvasFrame(canvasElement)
    await expect(frame).toHaveAttribute('class', HERO_FULL_BLEED_FRAME_CLASS)
    // Scrim and bottom fade both present.
    await expect(
      canvasElement.querySelector('.bg-gradient-to-r'),
    ).not.toBeNull()
    await expect(canvasElement.querySelector('.h-24')).not.toBeNull()
    // The escape, measured rather than asserted: the canvas starts above the
    // hero (128px up at this width — the 64px header plus the Container's
    // mt-16), spans the viewport, and its clip panel is centered on the page.
    const header = canvasElement.querySelector('header') as HTMLElement
    const frameEl = frame as HTMLElement
    const frameBox = frameEl.getBoundingClientRect()
    const headerBox = header.getBoundingClientRect()
    const panelBox = (
      frameEl.firstElementChild as HTMLElement
    ).getBoundingClientRect()

    await expect(headerBox.top - frameBox.top).toBe(
      window.innerWidth >= 640 ? 192 : 128,
    )
    await expect(Math.round(frameBox.width)).toBe(window.innerWidth)
    await expect(panelBox.width).toBeGreaterThan(headerBox.width)
    await expect(
      Math.abs(
        panelBox.left +
          panelBox.width / 2 -
          (headerBox.left + headerBox.width / 2),
      ),
    ).toBeLessThan(1)
  },
}

/**
 * The stacking regression, staging QA 2026-08-12: a full-bleed canvas is
 * 36rem tall, so the first blocks on the page render *inside* its span. They
 * must paint on top of it. When the isolation sat on the hero's own
 * `<header>` (#31 as shipped), the header painted as one atomic unit above
 * every following in-flow block and a socialLinks container at y≈348 was
 * completely occluded.
 *
 * @remarks Paint order is asserted by hit testing, which follows paint order:
 * the canvas is `pointer-events-none` (so it is normally untouchable), and the
 * probe re-enables it for the duration of the check only. A browser check
 * beyond this story should confirm the same thing photographically — screenshot
 * a block inside the span with the canvas shown and with it hidden, and count
 * the block's own dark pixels; the counts must match (they were 408 vs 0 when
 * this defect was live).
 */
export const ShaderFullBleedWithBlocksBelow: Story = {
  args: { page: page({ type: 'shader', presentation: 'fullBleed' }) },
  decorators: [
    (Story) => (
      <>
        <Story />
        {/* What `RenderBlocks` renders under the hero on the real route. */}
        <div className="mt-8">
          <section data-testid="block-in-span" className="my-12">
            <div className="flex flex-wrap gap-6">
              {['One', 'Two', 'Three'].map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-zinc-900 px-3 py-1 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  {label}
                </span>
              ))}
            </div>
          </section>
        </div>
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const frame = canvasFrame(canvasElement) as HTMLElement
    const block = canvas.getByTestId('block-in-span')
    const panel = canvasElement.querySelector(
      '[data-page-panel]',
    ) as HTMLElement

    /** Paint order at a point, topmost first — hit testing follows painting. */
    const stackAt = (x: number, y: number) => {
      // The canvas is `pointer-events-none` by design, so it can never be hit;
      // enable it for the probe only.
      frame.style.pointerEvents = 'auto'
      const stack = document.elementsFromPoint(x, y)
      frame.style.pointerEvents = ''
      return stack
    }

    // Probes 1 and 2 run at the top of the page, where the canvas band is.
    window.scrollTo(0, 0)
    const clip = frame.firstElementChild as HTMLElement
    const clipBox = clip.getBoundingClientRect()
    const heading = canvas.getByRole('heading', { name: 'Working together' })
    const headingBox = heading.getBoundingClientRect()

    // 1. The canvas paints above the page panel — the reason an isolating
    //    ancestor is needed at all. (Without one, `-z-10` resolves against the
    //    root and the canvas hides behind the panel.)
    const overCanvas = stackAt(clipBox.left + 6, clipBox.top + 6)
    await expect(overCanvas).toContain(frame)
    await expect(overCanvas.indexOf(frame)).toBeLessThan(
      overCanvas.indexOf(panel),
    )

    // 2. The hero's own text still paints above the canvas.
    const overHeading = stackAt(
      headingBox.left + 5,
      headingBox.top + headingBox.height / 2,
    )
    await expect(overHeading.indexOf(frame)).toBeGreaterThan(0)

    // 3. The block inside the canvas's span paints above the canvas — the
    //    regression itself. It really is inside the span, or this would pass
    //    for the wrong reason.
    block.scrollIntoView({ block: 'center' })
    const frameBox = frame.getBoundingClientRect()
    const blockBox = block.getBoundingClientRect()
    await expect(blockBox.top).toBeGreaterThan(frameBox.top)
    await expect(blockBox.bottom).toBeLessThan(frameBox.bottom)

    const overBlock = stackAt(
      blockBox.left + blockBox.width / 2,
      blockBox.top + blockBox.height / 2,
    )
    await expect(overBlock).toContain(frame)
    await expect(overBlock.indexOf(block)).toBeLessThan(
      overBlock.indexOf(frame),
    )
  },
}

/** The same hero on a different preset — the select's whole point. */
export const ShaderFullBleedAlternatePreset: Story = {
  args: {
    page: page({
      type: 'shader',
      presentation: 'fullBleed',
      shaderPreset: 'drifting-lights-8',
    }),
  },
}

/**
 * `type: shader, presentation: card` — the bounded panel the `shaderHero`
 * block renders today, with the hero text sitting on the canvas. No scrim,
 * no bottom fade: a card has no page background to blend into.
 */
export const ShaderCard: Story = {
  args: { page: page({ type: 'shader', presentation: 'card' }) },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector('header')
    await expect(header).toHaveAttribute('class', HERO_CARD_SHELL_CLASS)
    await expect(canvasFrame(canvasElement)).toHaveAttribute(
      'class',
      HERO_CARD_FRAME_CLASS,
    )
    await expect(canvasElement.querySelector('.bg-gradient-to-r')).toBeNull()
    await expect(canvasElement.querySelector('.h-24')).toBeNull()
  },
}

/**
 * `headlineVariant: typewriter` — the Home/About treatment, which a CMS page
 * could not reach before #38 (`RenderHero` hard-coded `line`).
 *
 * @remarks Reduced motion is not a variant: `AnimatedHeadline` renders plain
 * static text under `prefers-reduced-motion` whichever value is stored, so
 * this story and {@link TypeNone} are the same headline for those readers.
 */
export const HeadlineTypewriter: Story = {
  args: {
    page: page({ type: 'none', headlineVariant: 'typewriter' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: 'Working together' })
    await expect(heading).toBeVisible()
    // The caret and the per-character spans are the typewriter's fingerprint;
    // the line variant emits `data-word` spans and no caret.
    await expect(
      heading.querySelectorAll('[data-char]').length,
    ).toBeGreaterThan(0)
    await expect(heading.querySelectorAll('[data-word]')).toHaveLength(0)
  },
}

/** The same headline on the default variant, for the side-by-side. */
export const HeadlineLine: Story = {
  args: { page: page({ type: 'none', headlineVariant: 'line' }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: 'Working together' })
    await expect(
      heading.querySelectorAll('[data-word]').length,
    ).toBeGreaterThan(0)
    await expect(heading.querySelectorAll('[data-char]')).toHaveLength(0)
  },
}

/**
 * `showSocialLinks: true` — the Identity `sameAs` row, drawn by the
 * `socialLinks` block's own `iconRow` view rather than a second copy of it.
 */
export const WithSocialLinks: Story = {
  args: {
    page: pageWithoutProse({ type: 'none', showSocialLinks: true }),
    socialLinks: identitySocialLinks,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of [
      'Follow on X',
      'Follow on GitHub',
      'Follow on LinkedIn',
    ])
      await expect(canvas.getByRole('link', { name })).toBeVisible()

    // The row is the last thing in the stack, at the homepage's 24px gap from
    // what precedes it — measured, because that number is the parity claim.
    const row = canvasElement.querySelector('header section') as HTMLElement
    const previous = row.parentElement?.previousElementSibling as HTMLElement
    await expect(
      Math.round(
        row.parentElement!.getBoundingClientRect().top -
          previous.getBoundingClientRect().bottom,
      ),
    ).toBe(24)
  },
}

/** The same hero with the toggle off: no row, and no gap left behind. */
export const WithoutSocialLinks: Story = {
  args: { page: page({ type: 'none', showSocialLinks: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('header section')).toBeNull()
    await expect(
      within(canvasElement).queryByRole('link', { name: 'Follow on X' }),
    ).toBeNull()
  },
}

/**
 * The acceptance criterion itself: a CMS page carrying Home's own content —
 * shader hero, full bleed, typewriter H1, the page `subtitle`, the Identity
 * icon row, and no hero prose or CTAs — which is Home's hero content stack.
 *
 * @remarks One known delta from the live homepage, left to #42: Home wraps
 * its subtitle and icon row in `ScrollReveal` (y 14 / 10, delay 0.26 / 0.37).
 * The elements, their order, their classes and their spacing match; the
 * entrance animation on those two does not.
 */
export const HomeHeroStack: Story = {
  args: {
    page: {
      id: 1,
      title:
        'Product and project leader focused on practical software delivery.',
      subtitle:
        "I'm Brandon, based in Orange County, CA. I help teams turn complex product goals into reliable, user-focused software.",
      slug: 'home',
      hero: {
        type: 'shader',
        presentation: 'fullBleed',
        headlineVariant: 'typewriter',
        showSocialLinks: true,
      },
    } as unknown as Page,
    socialLinks: identitySocialLinks,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { level: 1 })
    await expect(
      heading.querySelectorAll('[data-char]').length,
    ).toBeGreaterThan(0)
    await expect(
      canvas.getByText(/I help teams turn complex product goals/),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Follow on X' }),
    ).toBeVisible()
    await expect(canvasFrame(canvasElement)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
    // Order, top to bottom: headline, subtitle, icon row.
    const row = canvasElement.querySelector('header section') as HTMLElement
    const subtitle = canvas.getByText(/I help teams turn complex product goals/)
    await expect(heading.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      subtitle.getBoundingClientRect().top,
    )
    await expect(subtitle.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      row.getBoundingClientRect().top,
    )
  },
}

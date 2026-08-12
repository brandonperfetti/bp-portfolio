import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { RenderHero } from '@/heros/RenderHero'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_FRAME_CLASS,
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
  title: 'Heros/RenderHero',
  component: RenderHero,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      // Stand-in for the route: `main` under a 64px header, then `Container`
      // exactly as `src/components/Container.tsx` builds it (outer gutters,
      // max-w-7xl panel, inner gutters, centered measure) with the `[slug]`
      // route's `mt-16 sm:mt-32`. The full-bleed hero climbs out of all of it.
      <div className="relative isolate min-h-[40rem] overflow-hidden bg-white dark:bg-zinc-900">
        <div className="h-16" />
        <div className="mt-16 sm:mt-32 sm:px-8">
          <div className="mx-auto w-full max-w-7xl lg:px-8">
            <div className="relative px-4 sm:px-8 lg:px-12">
              <div className="mx-auto max-w-2xl lg:max-w-5xl">
                <Story />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof RenderHero>

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

import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor } from 'storybook/test'

import { ShaderHeroBlockComponent } from '@/blocks/ShaderHero/Component'
import { HeroView } from '@/heros/HeroView'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_PANEL_CLASS,
  HERO_CARD_SHELL_CLASS,
} from '@/heros/presentation'
import type { Page, ShaderHeroBlock } from '@/payload-types'

const richText = {
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'heading',
        tag: 'h2',
        version: 1,
        children: [{ type: 'text', version: 1, text: 'Shader section' }],
      },
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            version: 1,
            text: 'A bounded animated panel with text overlaid. Without WebGPU or under reduced motion it is the static gradient — the canvas is decoration.',
          },
        ],
      },
    ],
  },
}

/**
 * The page hero configured the way #39 says new content should be built:
 * `type: shader`, `presentation: card`. The parity story renders it beside
 * the block so the two are compared, not asserted about separately.
 */
const cardHeroPage = {
  id: 1,
  title: 'Shader section',
  slug: 'shader-card',
  hero: {
    type: 'shader',
    presentation: 'card',
    shaderPreset: 'northern-lights-2',
  },
} as unknown as Page

/**
 * The legacy `shaderHero` block (#39). It no longer implements a shader
 * panel: it renders the hero system's `card` presentation, so what these
 * stories show is the hero card with the block's rich text in it.
 *
 * @remarks Without WebGPU (most CI runs) the canvas is the static gradient
 * fallback — which is itself an acceptance criterion, and is what the parity
 * play compares.
 */
const meta = {
  title: 'PageBuilder/ShaderHero (legacy)',
  component: ShaderHeroBlockComponent,
  tags: ['autodocs'],
  args: {
    blockType: 'shaderHero',
    preset: 'northern-lights-2',
    richText: richText as unknown as ShaderHeroBlock['richText'],
  },
} satisfies Meta<typeof ShaderHeroBlockComponent>

export default meta
type Story = StoryObj<typeof meta>

/** A stored block, exactly as the dispatcher renders it at layout root. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const section = canvasElement.querySelector('section') as HTMLElement

    // The hero card shell, plus the block's own page rhythm.
    for (const token of HERO_CARD_SHELL_CLASS.split(' ')) {
      await expect(section).toHaveClass(token)
    }
    await expect(section).toHaveClass('my-12')
    await expect(section.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      320,
    )
  },
}

/** The same block with no rich text — canvas only, no overlay element. */
export const CanvasOnly: Story = {
  args: { richText: undefined },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')?.children).toHaveLength(
      1,
    )
  },
}

const shell = (canvasElement: HTMLElement, testId: string) =>
  canvasElement.querySelector(
    `[data-testid="${testId}"] > :is(section, header)`,
  ) as HTMLElement

/** The canvas frame: the shell's only `aria-hidden` direct child. */
const frame = (host: HTMLElement) =>
  host.querySelector(':scope > [aria-hidden="true"]') as HTMLElement

/**
 * #39's acceptance criterion, as a comparison: the block and the page hero's
 * `card` presentation draw the same panel, because they are the same code.
 *
 * The two shells hold different content by design — the block overlays its
 * rich text, the hero overlays a headline stack — so what is compared is the
 * shell and the canvas: the frame geometry, the clip panel, the static
 * gradient, and the two treatments a bounded card must *not* have (the
 * legibility scrim and the fade into the page below, both of which exist to
 * blend a page-top background into a page).
 */
export const CardParityWithThePageHero: Story = {
  render: (args) => (
    <div className="space-y-8" style={{ width: 640 }}>
      <div data-testid="block">
        <ShaderHeroBlockComponent {...args} />
      </div>
      <div data-testid="hero">
        <HeroView page={cardHeroPage} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const blockShell = shell(canvasElement, 'block')
    const heroShell = shell(canvasElement, 'hero')

    // The hero owns the shell string; the block adds only its page rhythm.
    await expect(heroShell).toHaveAttribute('class', HERO_CARD_SHELL_CLASS)
    await expect(blockShell).toHaveAttribute(
      'class',
      `${HERO_CARD_SHELL_CLASS} my-12`,
    )

    for (const host of [blockShell, heroShell]) {
      await waitFor(() => expect(frame(host)).not.toBeNull())

      await expect(frame(host)).toHaveAttribute('class', HERO_CARD_FRAME_CLASS)
      await expect(frame(host).firstElementChild).toHaveAttribute(
        'class',
        HERO_CARD_PANEL_CLASS,
      )

      // The static gradient paints first in both, so text LCPs without the
      // canvas — and it is the whole background when there is no GPU.
      const gradient = frame(host).querySelector('.bg-gradient-to-br')
      await expect(gradient).toHaveAttribute(
        'class',
        'absolute inset-0 bg-gradient-to-br from-zinc-100 via-white to-teal-50 dark:from-zinc-950 dark:via-[#0b1329] dark:to-black',
      )

      // No scrim, no bottom fade: a card has no page background to blend into.
      await expect(frame(host).querySelector('.bg-gradient-to-r')).toBeNull()
      await expect(frame(host).querySelector('.h-24')).toBeNull()

      // The canvas fills the card exactly — `inset-0` on both, measured.
      const box = frame(host).getBoundingClientRect()
      const card = host.getBoundingClientRect()
      await expect(Math.round(box.width)).toBe(Math.round(card.width))
      await expect(Math.round(box.height)).toBe(Math.round(card.height))
    }

    // Same width in, same panel out — the geometry is not content-dependent.
    await expect(
      Math.round(frame(blockShell).getBoundingClientRect().width),
    ).toBe(Math.round(frame(heroShell).getBoundingClientRect().width))
  },
}

import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ShaderHero } from '@/components/heros/ShaderHero'
import { SHADER_PRESETS } from '@/components/heros/presets'

/**
 * shaders.com hero background (wow moment #1) with §23 fallbacks: static
 * gradient under reduced motion or without WebGPU/WebGL2, offscreen unmount,
 * theme-aware preset swap.
 *
 * @remarks In browsers without WebGPU (most CI/Playwright runs) the story
 * shows the static-gradient fallback — that fallback rendering is itself an
 * acceptance criterion. Open in Chrome with WebGPU for the animated aurora.
 */
const meta = {
  title: 'Heros/ShaderHero',
  component: ShaderHero,
  tags: ['autodocs'],
  argTypes: {
    preset: {
      control: 'select',
      options: [...SHADER_PRESETS],
    },
  },
  decorators: [
    (Story) => (
      // The hero positions absolutely against the page top; give it a stage.
      <div className="relative isolate min-h-[40rem] overflow-hidden">
        <Story />
        <div className="relative z-10 mx-auto max-w-2xl px-6 pt-24">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-100 [text-shadow:0_1px_8px_rgba(0,0,0,0.5)]">
            Hero text stays server-rendered
          </h1>
          <p className="mt-4 text-zinc-200 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
            The canvas is decoration behind real HTML — headline, tagline, and
            links LCP without waiting on WebGPU.
          </p>
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ShaderHero>

export default meta
type Story = StoryObj<typeof meta>

export const NorthernLights: Story = {
  args: { preset: 'northern-lights-2' },
}

export const DriftingLights: Story = {
  args: { preset: 'drifting-lights-8' },
}

export const StaticNoiseLight: Story = {
  args: { preset: 'static-noise-4' },
}

/**
 * The framing the CMS hero's `card` presentation passes: the canvas fills a
 * bounded panel instead of the page top, with the scrim and the bottom fade
 * off — both exist to blend a page-top background into the page below, which
 * a card must not do (#31).
 */
export const CardFraming: Story = {
  args: {
    preset: 'northern-lights-2',
    className: 'pointer-events-none absolute inset-0 -z-10',
    panelClassName: 'h-full w-full',
    scrim: false,
    bottomFade: false,
  },
  decorators: [
    (Story) => (
      <div className="relative isolate min-h-[20rem] overflow-hidden rounded-2xl">
        <Story />
        <div className="relative z-10 flex min-h-[20rem] items-center p-8 sm:p-12">
          <p className="max-w-xl text-zinc-100 [text-shadow:0_1px_8px_rgba(0,0,0,0.25)]">
            Bounded card framing — the panel clips the canvas and the text sits
            on top of it.
          </p>
        </div>
      </div>
    ),
  ],
}

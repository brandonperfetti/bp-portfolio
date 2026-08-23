import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'

import { HeadingBlockComponent } from '@/blocks/Heading/Component'
import {
  HEADING_LEVEL_CLASSES,
  type HeadingBlockLevel,
  type HeadingBlockVariant,
} from '@/blocks/Heading/levels'

const TEXT = 'I build software with a product mindset'

/**
 * Forces `(prefers-reduced-motion: reduce)` for one story.
 *
 * @remarks A Storybook `beforeEach` rather than a decorator: the swap has to
 * land before the component's own `useLayoutEffect` reads `matchMedia`, and a
 * decorator's effects run *after* its children's. Returning the restore
 * function keeps the override scoped to the story that asked for it.
 */
const forceReducedMotion = async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  return () => {
    window.matchMedia = original
  }
}

/**
 * Heading block (#36): the site's `AnimatedHeadline` — `line` or
 * `typewriter`, h1 through h3 — as something an editor can place. Both
 * animations already existed; what did not exist was a way to compose one
 * outside a hero, which is why the about page's typewriter H1 was
 * un-CMS-able.
 */
const meta = {
  title: 'PageBuilder/Heading',
  component: HeadingBlockComponent,
  tags: ['autodocs'],
  args: {
    blockType: 'heading',
    text: TEXT,
    level: 'h2',
    variant: 'line',
  } as never,
  argTypes: {
    level: { control: 'inline-radio', options: ['h1', 'h2', 'h3'] },
    variant: { control: 'inline-radio', options: ['line', 'typewriter'] },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HeadingBlockComponent>

export default meta
type Story = StoryObj<typeof meta>

/** Words rise into place — the quieter variant, and the default. */
export const Line: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: TEXT })

    await expect(heading.tagName).toBe('H2')
    await expect(heading.querySelectorAll('[data-word]').length).toBe(
      TEXT.split(' ').length,
    )
    await expect(heading.querySelector('[data-char]')).toBeNull()
    // The animation ends with every word visible and in place. The last word
    // starts at delay + 5 staggers and runs a 1.14s tween, so the window has
    // to be generous — see `lib/motion/timing.ts`.
    await waitFor(
      async () => {
        const last = heading.querySelectorAll('[data-word]')
        const style = getComputedStyle(last[last.length - 1])
        await expect(Number(style.opacity)).toBe(1)
      },
      { timeout: 5000 },
    )
  },
}

/** Characters, then a blinking caret — the home and about page treatment. */
export const Typewriter: Story = {
  args: { variant: 'typewriter' } as never,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: TEXT })

    // One span per non-space character, plus the caret.
    await expect(heading.querySelectorAll('[data-char]').length).toBe(
      TEXT.replace(/\s/g, '').length,
    )
    await expect(heading.textContent).toContain('|')
    // Screen readers get the sentence once, not letter by letter.
    await expect(heading.querySelector('.sr-only')?.textContent).toBe(TEXT)
    await expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull()

    await waitFor(
      async () => {
        const chars = heading.querySelectorAll('[data-char]')
        const last = chars[chars.length - 1]
        await expect(Number(getComputedStyle(last).opacity)).toBe(1)
      },
      { timeout: 5000 },
    )
  },
}

/**
 * The #36 acceptance criterion, and §13's rule for every animated surface:
 * a visitor who asks for less motion gets the finished heading — real text,
 * one copy of it, no per-character spans, no caret, nothing hidden waiting
 * for an animation that will never run.
 */
export const TypewriterReducedMotion: Story = {
  args: { variant: 'typewriter', level: 'h1' } as never,
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: TEXT })

    await expect(heading.tagName).toBe('H1')
    await expect(heading.textContent).toBe(TEXT)
    await expect(heading.querySelector('[data-char]')).toBeNull()
    await expect(heading.querySelector('[data-word]')).toBeNull()
    await expect(heading.querySelector('.sr-only')).toBeNull()
    // No caret, so no stray pipe in the accessible text.
    await expect(heading.textContent).not.toContain('|')
    // Visible immediately: nothing is waiting on a GSAP tween.
    await expect(getComputedStyle(heading).opacity).toBe('1')
    await expect(getComputedStyle(heading).visibility).toBe('visible')
    // Still the h1 style, animation or not.
    for (const cls of HEADING_LEVEL_CLASSES.h1.split(' ')) {
      await expect(heading).toHaveClass(cls)
    }
  },
}

/** Same guarantee for the `line` variant. */
export const LineReducedMotion: Story = {
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: TEXT })

    await expect(heading.textContent).toBe(TEXT)
    await expect(heading.querySelector('[data-word]')).toBeNull()
    await expect(getComputedStyle(heading).opacity).toBe('1')
  },
}

const LEVELS: HeadingBlockLevel[] = ['h1', 'h2', 'h3']
const VARIANTS: HeadingBlockVariant[] = ['line', 'typewriter']

/**
 * The level × variant matrix in one frame: three sizes, two animations, and
 * the semantic tag each level actually renders.
 */
export const LevelAndVariantMatrix: Story = {
  render: (args) => (
    <div className="space-y-10">
      {VARIANTS.map((variant) => (
        <div key={variant} className="space-y-6">
          <p className="text-xs font-semibold text-zinc-500 uppercase">
            variant: {variant}
          </p>
          {LEVELS.map((level) => (
            <div key={level} data-testid={`${variant}-${level}`}>
              <HeadingBlockComponent
                {...args}
                level={level}
                variant={variant}
                text={`${level.toUpperCase()} — ${TEXT}`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const variant of VARIANTS) {
      for (const level of LEVELS) {
        const cell = canvasElement.querySelector(
          `[data-testid="${variant}-${level}"]`,
        )
        const heading = cell?.firstElementChild as HTMLElement

        await expect(heading.tagName).toBe(level.toUpperCase())
        for (const cls of HEADING_LEVEL_CLASSES[level].split(' ')) {
          await expect(heading).toHaveClass(cls)
        }
      }
    }

    // The scale actually steps down, rendered rather than asserted on classes.
    const size = (variant: string, level: string) =>
      parseFloat(
        getComputedStyle(
          canvasElement.querySelector(
            `[data-testid="${variant}-${level}"] > *`,
          ) as Element,
        ).fontSize,
      )
    await expect(size('line', 'h1')).toBeGreaterThan(size('line', 'h2'))
    await expect(size('line', 'h2')).toBeGreaterThan(size('line', 'h3'))
  },
}

/**
 * The #40 contract: at root the heading carries its own `my-12`; inside a
 * column the stack owns the rhythm.
 */
export const HostedInAColumn: Story = {
  render: (args) => (
    <div>
      <div data-testid="root-hosted">
        <HeadingBlockComponent {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <HeadingBlockComponent {...args} hosted="column" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector(
      '[data-testid="root-hosted"] > *',
    ) as HTMLElement
    const column = canvasElement.querySelector(
      '[data-testid="column-hosted"] > *',
    ) as HTMLElement

    await expect(root).toHaveClass('my-12')
    await expect(column).not.toHaveClass('my-12')
    await expect(getComputedStyle(column).marginTop).toBe('0px')
  },
}

import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ImageView } from '@/blocks/Image/ImageView'
import {
  IMAGE_ASPECT_CLASSES,
  IMAGE_TILT_CLASSES,
  type ImageAspect,
  type ImageTilt,
} from '@/blocks/Image/treatment'

const PORTRAIT = 'https://picsum.photos/seed/bp-portrait/1024/1024'
const LANDSCAPE = 'https://picsum.photos/seed/bp-landscape/1600/900'

/**
 * Image block (#33), presentational. The block exists because the about-page
 * portrait — tilted, rounded, square-cropped, hover-scaled — was unreachable
 * from the CMS; these stories walk the controls that make it reachable.
 */
const meta = {
  title: 'PageBuilder/Image',
  component: ImageView,
  tags: ['autodocs'],
  args: {
    src: LANDSCAPE,
    alt: 'A placeholder photograph',
    width: 1600,
    height: 900,
    aspect: 'auto',
    rounded: '2xl',
    tilt: 'none',
    hoverScale: false,
    priority: false,
  },
  argTypes: {
    aspect: {
      control: 'select',
      options: Object.keys(IMAGE_ASPECT_CLASSES),
    },
    tilt: { control: 'inline-radio', options: Object.keys(IMAGE_TILT_CLASSES) },
    rounded: {
      control: 'inline-radio',
      options: ['none', 'lg', '2xl', 'full'],
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageView>

export default meta
type Story = StoryObj<typeof meta>

/** The `mediaBlock` behaviour, which stays the default: no crop, card corners. */
export const Default: Story = {}

/**
 * The acceptance criterion, as an editor composes it: tilt right,
 * `rounded-2xl`, square crop, hover scale — the about-page portrait.
 */
export const AboutPortrait: Story = {
  args: {
    src: PORTRAIT,
    alt: 'Brandon Perfetti',
    width: 800,
    height: 800,
    aspect: 'square',
    rounded: '2xl',
    tilt: 'right',
    hoverScale: true,
  },
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector('figure > div > div')
    const img = canvasElement.querySelector('img')

    // The frame clips the image, carries the corners and the rotation —
    // exactly the `overflow-hidden rounded-2xl md:rotate-3` About writes.
    await expect(frame).toHaveClass(
      'overflow-hidden',
      'rounded-2xl',
      'rotate-3',
    )
    await expect(img).toHaveClass('aspect-square', 'object-cover')
    // `data-hover-image` is what HoverMotionCard scales on hover.
    await expect(img).toHaveAttribute('data-hover-image')
    // ...and the hover treatment is a wrapper, present only when asked for.
    await expect(canvasElement.querySelector('.transform-gpu')).not.toBeNull()
  },
}

/** Hover off means no motion wrapper at all — no client JS for the common case. */
export const NoHoverScale: Story = {
  args: { ...AboutPortrait.args, hoverScale: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.transform-gpu')).toBeNull()
    await expect(
      canvasElement.querySelector('img[data-hover-image]'),
    ).not.toBeNull()
  },
}

const TILTS: ImageTilt[] = ['left', 'none', 'right']
const ASPECTS: ImageAspect[] = ['auto', 'square', 'portrait', 'video', 'wide']

/**
 * The tilt × aspect matrix in one frame, so a class-map regression is
 * visible rather than inferred. Hover is the third axis and is exercised by
 * {@link AboutPortrait} / {@link NoHoverScale}, which assert the wrapper's
 * presence — a hover state can't be photographed here.
 */
export const TiltAndAspectMatrix: Story = {
  render: (args) => (
    <div className="space-y-10">
      {TILTS.map((tilt) => (
        <div key={tilt}>
          <p className="mb-3 text-xs font-semibold text-zinc-500 uppercase">
            tilt: {tilt}
          </p>
          <div className="grid grid-cols-5 gap-4">
            {ASPECTS.map((aspect) => (
              <div key={aspect} data-testid={`${tilt}-${aspect}`}>
                <ImageView {...args} tilt={tilt} aspect={aspect} />
                <p className="mt-1 text-[11px] text-zinc-500">{aspect}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-4xl">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    for (const tilt of TILTS) {
      for (const aspect of ASPECTS) {
        const cell = canvasElement.querySelector(
          `[data-testid="${tilt}-${aspect}"]`,
        )
        const frame = cell?.querySelector('figure > div')
        const img = cell?.querySelector('img')

        const tiltClass = IMAGE_TILT_CLASSES[tilt]
        if (tiltClass) await expect(frame).toHaveClass(tiltClass)
        else await expect(frame?.className).not.toMatch(/rotate-/)

        for (const cls of IMAGE_ASPECT_CLASSES[aspect].split(' ')) {
          await expect(img).toHaveClass(cls)
        }
      }
    }
  },
}

/** The caption renders as a real `figcaption` inside the `figure`. */
export const WithCaption: Story = {
  args: { caption: 'Somewhere between Orange County and the terminal.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const caption = canvas.getByText(/Orange County/)

    await expect(caption.tagName).toBe('FIGCAPTION')
    await expect(caption.closest('figure')).not.toBeNull()
  },
}

/**
 * The LCP hint. Nothing about the layout changes, so the two are shown side
 * by side: `priority` drops `loading="lazy"`, which is what tells the
 * browser to fetch the image immediately instead of on approach.
 *
 * The assertion is deliberately on `loading` rather than `fetchpriority` —
 * this `next/image` renders no `fetchpriority` attribute, and the story
 * should assert what the browser actually receives. That the block hands
 * `priority` through at all is covered in `Component.test.tsx`.
 */
export const PriorityLcp: Story = {
  render: (args) => (
    <div className="space-y-6">
      <div data-testid="priority">
        <ImageView {...args} priority />
      </div>
      <div data-testid="lazy">
        <ImageView {...args} priority={false} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const priority = canvasElement.querySelector('[data-testid="priority"] img')
    const lazy = canvasElement.querySelector('[data-testid="lazy"] img')

    await expect(priority).not.toHaveAttribute('loading', 'lazy')
    await expect(lazy).toHaveAttribute('loading', 'lazy')
  },
}

/**
 * The rail inset (#3): `xs` reproduces the `px-2.5` the about-page portrait
 * keeps inside its narrow rail, so the photo breathes rather than running edge
 * to edge. `none` — the default — fills the width it is given, shown alongside
 * for the comparison.
 */
export const RailInset: Story = {
  render: (args) => (
    <div className="space-y-6">
      <div data-testid="inset-none">
        <ImageView {...args} inset="none" />
      </div>
      <div data-testid="inset-xs">
        <ImageView {...args} inset="xs" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const none = canvasElement.querySelector(
      '[data-testid="inset-none"] figure',
    )
    const xs = canvasElement.querySelector('[data-testid="inset-xs"] figure')

    await expect(none).not.toHaveClass('px-2.5')
    await expect(xs).toHaveClass('px-2.5')
    // The inset narrows the rendered image, exactly the ~20px the rail wants.
    const noneImg = canvasElement.querySelector(
      '[data-testid="inset-none"] img',
    )
    const xsImg = canvasElement.querySelector('[data-testid="inset-xs"] img')
    await expect((xsImg as HTMLElement).clientWidth).toBeLessThan(
      (noneImg as HTMLElement).clientWidth,
    )
  },
}

/**
 * The #40 contract: at root the block carries its own `my-12`; inside a
 * column the stack owns the rhythm and the block emits none.
 */
export const HostedInAColumn: Story = {
  render: (args) => (
    <div className="space-y-8">
      <div data-testid="root-hosted">
        <ImageView {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <ImageView {...args} hosted="column" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector(
      '[data-testid="root-hosted"] figure',
    )
    const column = canvasElement.querySelector(
      '[data-testid="column-hosted"] figure',
    )

    await expect(root).toHaveClass('my-12')
    await expect(column).not.toHaveClass('my-12')
    await expect(getComputedStyle(column as Element).marginTop).toBe('0px')
  },
}

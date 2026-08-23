import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect } from 'storybook/test'

import { PhotoStripBlockComponent } from '@/blocks/PhotoStrip/Component'
import { PHOTO_STRIP_FULL_BLEED_CLASS } from '@/blocks/PhotoStrip/fullBleed'
import type { Media, PhotoStripBlock } from '@/payload-types'

/** The homepage gallery photos, as resolved Media the block hands the strip. */
const IMAGES = [
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-2_vutl5o.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298667/image-3_rfkaku.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298665/image-4_iten8l.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298668/image-5_cpx20p.jpg',
].map((url, index) => ({ id: index + 1, url }) as Media)

const block = (overrides: Partial<PhotoStripBlock> = {}): PhotoStripBlock =>
  ({ blockType: 'photoStrip', images: IMAGES, ...overrides }) as PhotoStripBlock

/**
 * The PhotoStrip block (#42): the homepage parallax gallery as a placeable
 * block, with two opt-in display controls — a full-bleed breakout to the
 * viewport and an LCP-priority flag on the first photo. Both default off, so
 * the block renders inside the reading column with no priority image, exactly
 * as it did before the controls existed.
 *
 * @remarks The decorator frames the block in a bounded reading column so the
 * full-bleed breakout is visible (it escapes this frame) rather than
 * theoretical — the same idiom the ContainerGrid full-bleed story uses.
 */
const meta = {
  title: 'PageBuilder/PhotoStrip',
  component: PhotoStripBlockComponent,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl overflow-x-clip">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PhotoStripBlockComponent>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Both controls off — the default. The strip sits inside the reading column
 * (no breakout wrapper) and the first photo is lazy, competing with nothing.
 */
export const Default: Story = {
  args: block(),
  play: async ({ canvasElement }) => {
    // The gallery photos carry empty alt (decorative), so they are out of the
    // a11y tree — query the DOM directly rather than by role.
    const images = canvasElement.querySelectorAll('img')
    await expect(images).toHaveLength(IMAGES.length)
    // No full-bleed breakout wrapper in the tree.
    await expect(canvasElement.querySelector('.w-screen')).toBeNull()
    // First photo is not priority: next/image leaves it lazy.
    await expect(images[0].getAttribute('fetchpriority')).not.toBe('high')
    await expect(images[0]).toHaveAttribute('loading', 'lazy')
  },
}

/**
 * `fullBleed: true` — the homepage placement: the strip breaks out of the
 * reading column to the full viewport width, using the established
 * `Container/section.ts` breakout idiom.
 */
export const FullBleed: Story = {
  args: block({ fullBleed: true }),
  play: async ({ canvasElement }) => {
    const breakout = canvasElement.querySelector('.w-screen')
    await expect(breakout).not.toBeNull()
    for (const cls of PHOTO_STRIP_FULL_BLEED_CLASS.split(' ')) {
      await expect(breakout).toHaveClass(cls)
    }
  },
}

/**
 * `priority: true` — the LCP behaviour of the home hero slot. The shared
 * component gates priority to the first photo only, so exactly one image is
 * marked high-priority.
 */
export const Priority: Story = {
  args: block({ priority: true }),
  play: async ({ canvasElement }) => {
    const images = canvasElement.querySelectorAll('img')
    // Only the first photo is priority: next/image drops its `loading="lazy"`
    // (the rest stay lazy), which is the LCP behaviour being forwarded.
    await expect(images[0]).not.toHaveAttribute('loading', 'lazy')
    await expect(images[1]).toHaveAttribute('loading', 'lazy')
  },
}

/**
 * Both controls on together — the exact home hero slot: a full-bleed strip
 * whose first photo is the LCP image.
 */
export const FullBleedPriority: Story = {
  args: block({ fullBleed: true, priority: true }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.w-screen')).not.toBeNull()
    const images = canvasElement.querySelectorAll('img')
    await expect(images[0]).not.toHaveAttribute('loading', 'lazy')
  },
}

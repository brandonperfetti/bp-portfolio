import NextImage from 'next/image'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import {
  IMAGE_ASPECT_CLASSES,
  IMAGE_FALLBACK_DIMENSIONS,
  IMAGE_INSET_CLASSES,
  IMAGE_ROUNDED_CLASSES,
  IMAGE_TILT_CLASSES,
  type ImageAspect,
  type ImageInset,
  type ImageRounded,
  type ImageTilt,
} from '@/blocks/Image/treatment'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { cn } from '@/lib/utils'

/**
 * Image block, presentational: plain props only (a URL and four class
 * choices), so every combination in the tilt × aspect × hover matrix is
 * reachable from a story without a Media document.
 *
 * @param src - Resolved image URL.
 * @param alt - Alt text from the Media document; empty marks it decorative.
 * @param width - Intrinsic width, for the aspect ratio Next reserves.
 * @param height - Intrinsic height.
 * @param aspect - Crop shape (see `treatment.ts`).
 * @param rounded - Corner treatment.
 * @param tilt - Rotation.
 * @param inset - Horizontal padding on the figure (see `treatment.ts`). `none`
 * by default, so the image fills the width it is given exactly as before.
 * @param hoverScale - Wrap in the site hover treatment.
 * @param priority - Preload as the LCP image instead of lazy-loading.
 * @param caption - Optional caption, rendered as a `figcaption`.
 * @param hosted - Where the block is rendering (see `hostContext.ts`).
 * @remarks The image always fills the width it is given (`w-full`) rather
 * than capping itself, because in a column the editor already chose the
 * width by choosing the column. The optional `inset` pads that width in from
 * both sides — the about-page portrait's `px-2.5` inside its narrow rail — and
 * is the only thing that ever narrows the image short of the column edge.
 *
 * `hoverScale` off means no `HoverMotionCard` at all — the block stays a
 * pure server render with no client JavaScript, which is the common case.
 */
export function ImageView({
  src,
  alt,
  width,
  height,
  aspect = 'auto',
  rounded = '2xl',
  tilt = 'none',
  inset = 'none',
  hoverScale = false,
  priority = false,
  caption,
  hosted,
}: {
  src: string
  alt: string
  width?: number | null
  height?: number | null
  aspect?: ImageAspect
  rounded?: ImageRounded
  tilt?: ImageTilt
  inset?: ImageInset
  hoverScale?: boolean
  priority?: boolean
  caption?: string | null
  hosted?: BlockHostContext
}) {
  const frame = (
    <div
      className={cn(
        'overflow-hidden',
        IMAGE_ROUNDED_CLASSES[rounded],
        IMAGE_TILT_CLASSES[tilt],
      )}
    >
      <NextImage
        src={src}
        alt={alt}
        width={width || IMAGE_FALLBACK_DIMENSIONS.width}
        height={height || IMAGE_FALLBACK_DIMENSIONS.height}
        sizes="(min-width: 1280px) 56rem, 100vw"
        priority={priority}
        data-hover-image
        className={cn(
          IMAGE_ASPECT_CLASSES[aspect],
          'bg-zinc-100 dark:bg-zinc-800',
        )}
      />
    </div>
  )

  return (
    <figure
      className={cn(blockRhythmClass(hosted), IMAGE_INSET_CLASSES[inset])}
    >
      {hoverScale ? (
        // The about-page portrait's exact settings: no lift, no root scale —
        // only the image behind the frame grows, so the rounded corners and
        // the tilt stay put while the photo breathes.
        <HoverMotionCard y={0} scale={1} imageScale={1.03}>
          {frame}
        </HoverMotionCard>
      ) : (
        frame
      )}
      {caption ? (
        <figcaption className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  )
}

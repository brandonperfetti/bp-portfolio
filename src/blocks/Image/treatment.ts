/**
 * The class vocabulary for the image block's four visual controls, in the
 * shape `Column/sizes.ts` established: complete literal strings in one map,
 * never built by interpolation, so Tailwind's source scan finds every class.
 */

/** Crop shapes an editor can pick. */
export type ImageAspect = 'auto' | 'square' | 'portrait' | 'video' | 'wide'

/** Corner treatments. */
export type ImageRounded = 'none' | 'lg' | '2xl' | 'full'

/** Rotation. */
export type ImageTilt = 'none' | 'left' | 'right'

/**
 * Shape → the classes on the `img` itself.
 *
 * @remarks `auto` keeps the upload's own proportions (the `mediaBlock`
 * behaviour); every other value crops with `object-cover`, which is how the
 * about-page portrait turns a 4:3 photo into a square without distortion.
 */
export const IMAGE_ASPECT_CLASSES: Record<ImageAspect, string> = {
  auto: 'h-auto w-full',
  square: 'aspect-square w-full object-cover',
  portrait: 'aspect-[3/4] w-full object-cover',
  video: 'aspect-video w-full object-cover',
  wide: 'aspect-[21/9] w-full object-cover',
}

/** Corner treatment → the class on the frame that clips the image. */
export const IMAGE_ROUNDED_CLASSES: Record<ImageRounded, string> = {
  none: '',
  lg: 'rounded-lg',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
}

/**
 * Tilt → the rotation on the frame.
 *
 * @remarks Unconditional, not `md:rotate-3` as the about page writes it: that
 * portrait lives inside an `lg:`-only branch, so its `md:` prefix is always
 * true wherever it renders, and the block reproduces it exactly at every
 * width. A viewport prefix would also be the wrong tool here — the block
 * has no idea how wide the column it was dropped into is
 * (see `hostContext.ts`), and an editor who wants an untilted image in a
 * narrow rail picks `none`.
 */
export const IMAGE_TILT_CLASSES: Record<ImageTilt, string> = {
  none: '',
  left: '-rotate-3',
  right: 'rotate-3',
}

/** Fallback intrinsic size when the Media document carries none. */
export const IMAGE_FALLBACK_DIMENSIONS = { width: 1600, height: 900 } as const

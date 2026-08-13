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

/** Horizontal inset — how far the image is padded in from the width it is given. */
export type ImageInset = 'none' | 'xs'

/** Mobile size — how wide the figure sits below `lg`; unconstrained from `lg` up. */
export type ImageSize = 'full' | 'compact'

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

/**
 * Horizontal inset → the padding on the `figure`.
 *
 * @remarks `none` is the default and the behaviour the block always had: the
 * image fills the width it is given (`ImageView`'s `w-full`). `xs` is the
 * about-page portrait's `px-2.5` — 10px a side — which the hand-built page
 * keeps on the portrait wrapper (`mx-auto max-w-xs px-2.5 lg:max-w-none`) so
 * the photo breathes inside its narrow rail rather than running edge to edge.
 * Pads the whole figure (image and caption alike), which is where that wrapper
 * sits relative to the frame. Literal strings so Tailwind's scan finds them.
 */
export const IMAGE_INSET_CLASSES: Record<ImageInset, string> = {
  none: '',
  xs: 'px-2.5',
}

/**
 * Mobile size → the width treatment on the `figure`.
 *
 * @remarks `full` is the default and the behaviour the block always had: the
 * image fills the width it is given (`ImageView`'s `w-full`), so this map
 * contributes nothing (`''`) and every existing block stays byte-identical.
 * `compact` is the about-page portrait's mobile half — its wrapper is
 * `mx-auto max-w-xs px-2.5 lg:max-w-none`, where `px-2.5` is the existing
 * `inset: xs` and `mx-auto max-w-xs lg:max-w-none` is supplied here: centered
 * at a small max-width below `lg`, unconstrained from `lg` up. Only the phone
 * view changes; desktop (`lg+`) is identical to `full`. Literal, unprefixed-
 * plus-`lg:` strings so Tailwind's source scan finds every class.
 */
export const IMAGE_SIZE_CLASSES: Record<ImageSize, string> = {
  full: '',
  compact: 'mx-auto max-w-xs lg:max-w-none',
}

/** Fallback intrinsic size when the Media document carries none. */
export const IMAGE_FALLBACK_DIMENSIONS = { width: 1600, height: 900 } as const

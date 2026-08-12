import { photoStripFullBleedClass } from '@/blocks/PhotoStrip/fullBleed'
import { PhotoStrip } from '@/components/home/PhotoStrip'
import type { Media, PhotoStripBlock } from '@/payload-types'

/**
 * CMS wrapper for the parallax photo strip: resolves the block's Media
 * uploads to URLs and hands them to the shared home-page component so both
 * surfaces stay pixel-identical.
 *
 * @remarks Both display fields default off, so a block written before they
 * existed renders exactly as it did: inside the reading column, with no
 * priority image.
 *
 * - `priority` forwards to the shared component, which gates it to the first
 *   image only — the home hero slot's LCP behaviour.
 * - `fullBleed` breaks the strip out of the reading column to the viewport,
 *   the homepage gallery placement (see `fullBleed.ts`).
 */
export function PhotoStripBlockComponent(props: PhotoStripBlock) {
  const images = (props.images ?? [])
    .map((image) =>
      image && typeof image === 'object' ? (image as Media).url : undefined,
    )
    .filter((url): url is string => Boolean(url))
  if (!images.length) return null

  const strip = (
    <PhotoStrip images={images} priority={props.priority ?? false} />
  )

  if (props.fullBleed) {
    return <div className={photoStripFullBleedClass(true)}>{strip}</div>
  }
  return strip
}

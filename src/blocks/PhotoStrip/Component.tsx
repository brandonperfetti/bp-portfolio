import { PhotoStrip } from '@/components/home/PhotoStrip'
import type { Media, PhotoStripBlock } from '@/payload-types'

/**
 * CMS wrapper for the parallax photo strip: resolves the block's Media
 * uploads to URLs and hands them to the shared home-page component so both
 * surfaces stay pixel-identical.
 */
export function PhotoStripBlockComponent(props: PhotoStripBlock) {
  const images = (props.images ?? [])
    .map((image) =>
      image && typeof image === 'object' ? (image as Media).url : undefined,
    )
    .filter((url): url is string => Boolean(url))
  if (!images.length) return null
  return <PhotoStrip images={images} />
}

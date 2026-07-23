import Image from 'next/image'

import type { Media, MediaBlock as MediaBlockProps } from '@/payload-types'

/**
 * Full-width media block (CMS page builder). Renders the upload with its
 * intrinsic dimensions when known; alt comes from the Media doc.
 */
export function MediaBlockComponent(props: MediaBlockProps) {
  const media = props.media as Media | number | null | undefined
  if (!media || typeof media !== 'object' || !media.url) return null

  return (
    <figure className="my-12">
      <Image
        src={media.url}
        alt={media.alt || ''}
        width={media.width || 1600}
        height={media.height || 900}
        sizes="(min-width: 1280px) 56rem, 100vw"
        className="h-auto w-full rounded-2xl bg-zinc-100 dark:bg-zinc-800"
      />
    </figure>
  )
}

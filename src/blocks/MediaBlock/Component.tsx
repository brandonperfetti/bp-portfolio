import Image from 'next/image'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import type { Media, MediaBlock as MediaBlockProps } from '@/payload-types'

/**
 * Full-width media block (CMS page builder). Renders the upload with its
 * intrinsic dimensions when known; alt comes from the Media doc.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. In
 * a column the stack owns the rhythm, so the figure drops its own margin
 * (#40 / visual-QA F2 — see `hostContext.ts`).
 * @remarks Legacy as of #33: the `image` block supersedes this one, adding
 * tilt, rounding, aspect, hover scale and the LCP `priority` hint. This stays
 * registered for the content that already uses it.
 */
export function MediaBlockComponent(
  props: MediaBlockProps & { hosted?: BlockHostContext },
) {
  const media = props.media as Media | number | null | undefined
  if (!media || typeof media !== 'object' || !media.url) return null

  return (
    <figure className={blockRhythmClass(props.hosted)}>
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

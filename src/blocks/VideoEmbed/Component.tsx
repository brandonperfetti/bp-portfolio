import Link from 'next/link'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { getExternalLinkProps } from '@/lib/link-utils'
import type { VideoEmbedBlock } from '@/payload-types'

/**
 * Normalizes YouTube/Vimeo URLs to privacy-enhanced embed URLs. Returns
 * null for unrecognized hosts (rendered as a plain link, never an iframe).
 */
export function resolveEmbedUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\./, '')
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = url.searchParams.get('v')
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1)
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }
  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return /^\d+$/.test(id ?? '')
      ? `https://player.vimeo.com/video/${id}?dnt=1`
      : null
  }
  return null
}

/**
 * Responsive 16:9 video embed (CMS page builder).
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. In
 * a column the stack owns the rhythm, so the embed drops its own margin
 * (#40 / visual-QA F2 — see `hostContext.ts`).
 */
export function VideoEmbedComponent(
  props: VideoEmbedBlock & { hosted?: BlockHostContext },
) {
  const embed = resolveEmbedUrl(props.url)

  if (!embed) {
    return (
      <p className={blockRhythmClass(props.hosted)}>
        <Link
          href={props.url}
          {...getExternalLinkProps(props.url)}
          className="font-medium text-teal-700 hover:text-teal-600 dark:text-teal-400"
        >
          {props.title}
        </Link>
      </p>
    )
  }

  return (
    <figure className={blockRhythmClass(props.hosted)}>
      <div className="aspect-video overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
        <iframe
          src={embed}
          title={props.title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    </figure>
  )
}

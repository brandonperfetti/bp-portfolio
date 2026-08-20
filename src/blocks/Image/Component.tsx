import type { BlockHostContext } from '@/blocks/hostContext'
import { ImageView } from '@/blocks/Image/ImageView'
import type { ImageBlock, Media } from '@/payload-types'

/**
 * Image block (CMS page builder): resolves the upload to a URL and hands the
 * treatment choices to {@link ImageView}, which owns every pixel and every
 * story.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Renders nothing when the upload hasn't been populated (depth 0
 * reads hand back an ID) or has no URL yet — the same guard `mediaBlock`
 * carries, so a half-filled draft can't throw on a published page.
 */
export function ImageBlockComponent(
  props: ImageBlock & { hosted?: BlockHostContext },
) {
  const media = props.media as Media | number | null | undefined
  if (!media || typeof media !== 'object' || !media.url) return null

  return (
    <ImageView
      src={media.url}
      alt={media.alt || ''}
      width={media.width}
      height={media.height}
      aspect={props.aspect}
      rounded={props.rounded}
      tilt={props.tilt}
      inset={props.inset}
      size={props.size}
      hoverScale={Boolean(props.hoverScale)}
      priority={Boolean(props.priority)}
      caption={props.caption}
      hosted={props.hosted}
    />
  )
}

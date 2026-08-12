import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import type { CallToActionBlock as CTABlockProps } from '@/payload-types'

/**
 * Call-to-action band (CMS page builder): rich text beside up to two link
 * buttons on a soft panel.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering. In
 * a column the stack owns the rhythm, so the band drops its own margin
 * (#40 / visual-QA F2 — see `hostContext.ts`).
 */
export function CallToActionBlockComponent(
  props: CTABlockProps & { hosted?: BlockHostContext },
) {
  const { richText, links } = props

  return (
    <section className={blockRhythmClass(props.hosted)}>
      <div className="flex flex-col gap-8 rounded-2xl border border-zinc-100 bg-zinc-50/60 p-8 md:flex-row md:items-center md:justify-between dark:border-zinc-700/40 dark:bg-zinc-800/30">
        <div className="max-w-2xl">
          <RichTextContent content={richText} />
        </div>
        {links?.length ? (
          <div className="flex shrink-0 flex-wrap gap-3">
            {links.map((row, index) => (
              <CMSLink key={row.id ?? index} link={row.link} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

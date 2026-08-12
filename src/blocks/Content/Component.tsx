import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import { cn } from '@/lib/utils'
import type { ContentBlock as ContentBlockProps } from '@/payload-types'

/**
 * Share of the block's own 12-track grid each stored column size takes, from
 * the container-query threshold up.
 *
 * @remarks `@3xl` (48rem) is the container-width equivalent of the `lg`
 * viewport breakpoint these spans used to key off — see `hostContext.ts` for
 * why that number and what it costs at the boundaries.
 */
const COLUMN_SPANS: Record<string, string> = {
  full: '@3xl:col-span-12',
  half: '@3xl:col-span-6',
  oneThird: '@3xl:col-span-4',
  twoThirds: '@3xl:col-span-8',
}

/**
 * Column-grid rich-text block (CMS page builder). Columns stack in a narrow
 * space and span a 12-column grid once the block itself is wide enough.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks This is the one grid block a column can't hold (a column array
 * inside a column), so in practice it only ever renders at root — it declares
 * its own query container anyway, because "wide enough" is a fact about the
 * block's own box and the route may not be the only thing that ever wraps it.
 */
export function ContentBlockComponent(
  props: ContentBlockProps & { hosted?: BlockHostContext },
) {
  const { columns } = props
  if (!columns?.length) return null

  return (
    <section className={blockRhythmClass(props.hosted)}>
      {/* Carries no margin of its own, so making it the query container
          leaves the section's spacing exactly as it was. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-8 gap-y-8 @3xl:grid-cols-12">
          {columns.map((column, index) => (
            <div
              key={column.id ?? index}
              className={cn(
                'col-span-1',
                COLUMN_SPANS[column.size ?? 'oneThird'] ??
                  COLUMN_SPANS.oneThird,
              )}
            >
              <RichTextContent content={column.richText} />
              {column.enableLink ? (
                <div className="mt-4">
                  <CMSLink link={column.link} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

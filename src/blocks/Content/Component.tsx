import { CMSLink } from '@/components/cms/CMSLink'
import { RichTextContent } from '@/components/cms/RichTextContent'
import { cn } from '@/lib/utils'
import type { ContentBlock as ContentBlockProps } from '@/payload-types'

const COLUMN_SPANS: Record<string, string> = {
  full: 'lg:col-span-12',
  half: 'lg:col-span-6',
  oneThird: 'lg:col-span-4',
  twoThirds: 'lg:col-span-8',
}

/**
 * Column-grid rich-text block (CMS page builder). Columns stack on mobile
 * and span a 12-column grid from `lg` up.
 */
export function ContentBlockComponent(props: ContentBlockProps) {
  const { columns } = props
  if (!columns?.length) return null

  return (
    <section className="my-12">
      <div className="grid grid-cols-1 gap-x-8 gap-y-8 lg:grid-cols-12">
        {columns.map((column, index) => (
          <div
            key={column.id ?? index}
            className={cn(
              'col-span-1',
              COLUMN_SPANS[column.size ?? 'oneThird'] ?? COLUMN_SPANS.oneThird,
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
    </section>
  )
}

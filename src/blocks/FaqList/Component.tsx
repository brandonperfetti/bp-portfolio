import { RichTextContent } from '@/components/cms/RichTextContent'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import type { FaqListBlock } from '@/payload-types'

const answerPlainText = (answer: unknown): string =>
  lexicalToBlocks(answer)
    .map((block) => (block.richText ?? []).map((rt) => rt.plainText).join(''))
    .join(' ')
    .trim()

/**
 * FAQ accordion (CMS page builder): native details/summary disclosures
 * (keyboard-operable, zero JS) plus FAQPage JSON-LD for rich results.
 */
export function FaqListComponent(props: FaqListBlock) {
  const { heading, items } = props
  if (!items?.length) return null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answerPlainText(item.answer),
      },
    })),
  }

  return (
    <section className="my-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(jsonLd) }}
      />
      {heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {heading}
        </h2>
      ) : null}
      <div className="mt-6 divide-y divide-zinc-100 rounded-2xl border border-zinc-100 dark:divide-zinc-700/40 dark:border-zinc-700/40">
        {items.map((item, index) => (
          <details key={item.id ?? index} className="group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-zinc-800 marker:hidden focus-visible:ring-2 focus-visible:ring-teal-500/70 focus-visible:outline-none dark:text-zinc-100">
              {item.question}
              <span
                aria-hidden
                className="text-zinc-400 transition-transform group-open:rotate-45 motion-reduce:transition-none"
              >
                +
              </span>
            </summary>
            <div className="pt-3 pb-1">
              <RichTextContent content={item.answer} className="prose-sm" />
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

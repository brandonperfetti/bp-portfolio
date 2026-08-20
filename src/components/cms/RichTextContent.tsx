import { ArticleBody } from '@/components/cms/ArticleBody'
import { Prose } from '@/components/Prose'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'

/**
 * Renders a Payload Lexical value through the site's typography pipeline
 * (`lexicalToBlocks` → `ArticleBody` → `Prose`), so block-builder content
 * matches article styling exactly.
 *
 * @param content Lexical editor state from any richText field.
 * @param className Optional wrapper classes for the Prose container.
 */
export function RichTextContent({
  content,
  className,
}: {
  content: unknown
  className?: string
}) {
  if (!content) return null
  const blocks = lexicalToBlocks(content)
  if (!blocks.length) return null
  return (
    <Prose className={className}>
      <ArticleBody blocks={blocks} />
    </Prose>
  )
}

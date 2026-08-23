import { RichTextContent } from '@/components/cms/RichTextContent'
import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import type { ProseBlock } from '@/payload-types'

/**
 * Long-form rich text (CMS page builder), rendered through the site's
 * article-body typography pipeline.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks `RichTextContent` is the same `lexicalToBlocks` → `ArticleBody` →
 * `Prose` chain `/articles/[slug]` renders its bodies with, so "identical
 * typography to the article body" is structural rather than a copied class
 * list. It already wraps its output in `Prose`, so the rhythm class rides on
 * that element instead of adding a wrapper.
 *
 * The site's typography config (`typography.ts`) gives a leading `h2` its own
 * 80px of lead and has no `:first-child` reset, so a prose block that starts
 * with a heading sits low in its slot — exactly as an article body does. That
 * is inherited, not chosen here; changing it is a site-wide typography
 * decision, not a block one.
 *
 * No width override: an article body caps at the `prose` measure (~65ch) and
 * so does this. That is the point of the block.
 *
 * Empty content renders nothing (`RichTextContent` returns null), so a block
 * an editor added and never filled leaves no gap behind.
 */
export function ProseBlockComponent(
  props: ProseBlock & { hosted?: BlockHostContext },
) {
  return (
    <RichTextContent
      content={props.content}
      className={blockRhythmClass(props.hosted)}
    />
  )
}

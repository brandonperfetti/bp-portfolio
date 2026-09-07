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
 * No width override: `prose` itself carries no `max-width` in this repo — the
 * site's `typography.ts` sets `theme.typography` outright (not under
 * `theme.extend`), which replaces `@tailwindcss/typography`'s default
 * `DEFAULT.css` — the one that defines the ~65ch cap — rather than merging
 * into it. So an article body, and this block alike, fill whatever width
 * their host gives them; the class list only has to match the article body's,
 * not carry a measure of its own. Whether `prose` SHOULD carry a measure is a
 * site-wide typography decision, out of scope here.
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

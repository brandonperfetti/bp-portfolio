import { Fragment, type ReactNode } from 'react'

import { ArticlesArchiveComponent } from '@/blocks/ArticlesArchive/Component'
import { CallToActionBlockComponent } from '@/blocks/CallToAction/Component'
import { CarouselComponent } from '@/blocks/Carousel/Component'
import { ContactFormComponent } from '@/blocks/ContactForm/Component'
import { ContainerBlockComponent } from '@/blocks/Container/Component'
import { CorvusChatBlockComponent } from '@/blocks/CorvusChat/Component'
import { FaqListComponent } from '@/blocks/FaqList/Component'
import { NewsletterSignupComponent } from '@/blocks/NewsletterSignup/Component'
import { StatsComponent } from '@/blocks/Stats/Component'
import { TestimonialsComponent } from '@/blocks/Testimonials/Component'
import { VideoEmbedComponent } from '@/blocks/VideoEmbed/Component'
import { WorkHistoryCardComponent } from '@/blocks/WorkHistoryCard/Component'
import { ContentBlockComponent } from '@/blocks/Content/Component'
import { FeatureCardGridComponent } from '@/blocks/FeatureCardGrid/Component'
import { HeadingBlockComponent } from '@/blocks/Heading/Component'
import { ImageBlockComponent } from '@/blocks/Image/Component'
import { LeadBlockComponent } from '@/blocks/Lead/Component'
import { LogoCarouselComponent } from '@/blocks/LogoCarousel/Component'
import { MediaBlockComponent } from '@/blocks/MediaBlock/Component'
import { PhotoStripBlockComponent } from '@/blocks/PhotoStrip/Component'
import { PostRollupComponent } from '@/blocks/PostRollup/Component'
import { ProseBlockComponent } from '@/blocks/Prose/Component'
import { ShaderHeroBlockComponent } from '@/blocks/ShaderHero/Component'
import { SocialLinksBlockComponent } from '@/blocks/SocialLinks/Component'
import { SpacerBlockComponent } from '@/blocks/Spacer/Component'
import {
  type BlockHostContext,
  type BlockHostDocument,
  DEFAULT_BLOCK_HOST_CONTEXT,
} from '@/blocks/hostContext'
import { visibilityClass } from '@/blocks/visibility'
import type { ColumnBlock, Page } from '@/payload-types'

type LayoutBlock = NonNullable<Page['layout']>[number]
type ColumnContentBlock = NonNullable<ColumnBlock['content']>[number]

/**
 * Anything this dispatcher renders: a root-level layout block, or one of
 * the leaf blocks a column may hold (a subset of the same set — columns
 * exclude `container`, `content` and `shaderHero`).
 */
export type RenderableBlock = ColumnContentBlock | LayoutBlock

/**
 * CMS page-builder dispatcher: maps each layout block's `blockType` to its
 * React component (the Brytecore/website-template pattern). Every block
 * registered here has a matching Storybook story so the repo, Storybook,
 * and the admin block picker stay a 1:1 set.
 *
 * @remarks Unknown block types render nothing rather than throwing, so a
 * schema addition can ship ahead of its component without breaking pages —
 * but outside production a console warning names the missing registration,
 * because a silently blank section is a debugging trap.
 *
 * Also renders column content: `container` → `column` → blocks recurses
 * back through here, so a column's leaf blocks reach the same dispatcher as
 * root-level ones and stay a single set.
 *
 * @remarks Responsive visibility (audit gap #6) is applied here, once, for any
 * block that carries a `visibility` field: `always` (the default) renders the
 * block bare, exactly as before; `desktopOnly`/`mobileOnly` wrap it in a
 * display-toggling `<div>` (see `visibility.ts`). Applied at the wrapper so a
 * block needs no per-component plumbing to gain it, and only when the value is
 * non-default so every existing page stays byte-identical. Column-level
 * visibility is instead applied on the column shell, since a `column` is
 * rendered by the container rather than dispatched here.
 *
 * @remarks `hosted` and `hostDoc` are the two halves of a block's context and
 * they are not interchangeable: `hosted` is *where on the page* (root or
 * column — a layout fact), `hostDoc` is *which document* (a `pages` or `posts`
 * id — a content fact). A block reads the first to size itself and the second
 * to query for things belonging to its host (#177). Both are ordinary props
 * threaded from the readers that already hold the answer, never a `headers()`
 * read: recovering the hosting document from the request would opt every page
 * carrying such a block out of static rendering.
 *
 * @param blocks - The blocks to dispatch, in stored order.
 * @param hosted - Where these blocks are rendering (see
 * {@link BlockHostContext}). Defaults to `root`, so every call site that
 * predates this prop renders exactly as it did; the column block passes
 * `column`, which is how a block learns it no longer owns the page width.
 * Blocks that lay out identically in either context simply ignore it.
 * @param hostDoc - The document these blocks were composed on (see
 * {@link BlockHostDocument}), when the caller knows it. Optional and
 * undefined-by-default for the same reason `hosted` has a default: a call site
 * that cannot name its host — a Storybook story, a test rendering a bare block
 * list — keeps working, and a block that reads it treats "no host" the way it
 * already treats "no selection". Handed only to the blocks that need it:
 * `container`, because it is the sole route to a nested column, and
 * `postRollup`, the one leaf that asks (#177).
 */
export function RenderBlocks({
  blocks,
  hosted = DEFAULT_BLOCK_HOST_CONTEXT,
  hostDoc,
}: {
  blocks: RenderableBlock[] | null | undefined
  hosted?: BlockHostContext
  hostDoc?: BlockHostDocument
}) {
  if (!blocks?.length) return null

  return (
    <Fragment>
      {blocks.map((block, index) => {
        const key = block.id ?? `${block.blockType}-${index}`
        const node = ((): ReactNode => {
          switch (block.blockType) {
            case 'cta':
              return (
                <CallToActionBlockComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'carousel':
              return <CarouselComponent key={key} {...block} hosted={hosted} />
            case 'container':
              // The only route from here to a nested column, so it is also
              // the only route the host document has into one (#177).
              return (
                <ContainerBlockComponent
                  key={key}
                  {...block}
                  hostDoc={hostDoc}
                />
              )
            case 'content':
              return (
                <ContentBlockComponent key={key} {...block} hosted={hosted} />
              )
            case 'corvusChat':
              return (
                <CorvusChatBlockComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'featureCardGrid':
              return (
                <FeatureCardGridComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'heading':
              return (
                <HeadingBlockComponent key={key} {...block} hosted={hosted} />
              )
            case 'image':
              return (
                <ImageBlockComponent key={key} {...block} hosted={hosted} />
              )
            case 'lead':
              return <LeadBlockComponent key={key} {...block} hosted={hosted} />
            case 'logoCarousel':
              return (
                <LogoCarouselComponent key={key} {...block} hosted={hosted} />
              )
            case 'mediaBlock':
              return (
                <MediaBlockComponent key={key} {...block} hosted={hosted} />
              )
            case 'photoStrip':
              return <PhotoStripBlockComponent key={key} {...block} />
            case 'postRollup':
              return (
                <PostRollupComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                  hostDoc={hostDoc}
                />
              )
            case 'prose':
              return (
                <ProseBlockComponent key={key} {...block} hosted={hosted} />
              )
            case 'shaderHero':
              return (
                <ShaderHeroBlockComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'spacer':
              return <SpacerBlockComponent key={key} {...block} />
            case 'articlesArchive':
              return (
                <ArticlesArchiveComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'contactForm':
              return (
                <ContactFormComponent key={key} {...block} hosted={hosted} />
              )
            case 'faqList':
              return <FaqListComponent key={key} {...block} hosted={hosted} />
            case 'newsletterSignup':
              return (
                <NewsletterSignupComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'stats':
              return <StatsComponent key={key} {...block} hosted={hosted} />
            case 'testimonials':
              return (
                <TestimonialsComponent key={key} {...block} hosted={hosted} />
              )
            case 'socialLinks':
              return (
                <SocialLinksBlockComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            case 'videoEmbed':
              return (
                <VideoEmbedComponent key={key} {...block} hosted={hosted} />
              )
            case 'workHistoryCard':
              return (
                <WorkHistoryCardComponent
                  key={key}
                  {...block}
                  hosted={hosted}
                />
              )
            default: {
              if (process.env.NODE_ENV !== 'production') {
                // `block` is `never` here (the switch is exhaustive over the
                // generated union), but CMS data can outrun the codebase.
                const { blockType } = block as { blockType: string }
                console.warn(
                  `[RenderBlocks] Unknown blockType "${blockType}" — no component is registered for it, so nothing was rendered. Add a case to RenderBlocks (and a matching story) or remove the block from the page.`,
                )
              }
              return null
            }
          }
        })()

        // Default visibility (`always`) resolves to an empty class, and an
        // empty class earns no wrapper — so a block that never set visibility
        // renders exactly as it did before this control existed. Only
        // `desktopOnly`/`mobileOnly` interpose a display-toggling wrapper,
        // which — because Tailwind's `space-y-*` targets a column's direct
        // children — is where the about-page's inline portrait and its
        // mobile-only social row get toggled per breakpoint.
        const visibility = visibilityClass(
          (block as { visibility?: string | null }).visibility,
        )
        return visibility ? (
          <div key={key} className={visibility}>
            {node}
          </div>
        ) : (
          <Fragment key={key}>{node}</Fragment>
        )
      })}
    </Fragment>
  )
}

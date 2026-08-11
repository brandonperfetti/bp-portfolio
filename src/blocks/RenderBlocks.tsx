import { Fragment } from 'react'

import { ArticlesArchiveComponent } from '@/blocks/ArticlesArchive/Component'
import { CallToActionBlockComponent } from '@/blocks/CallToAction/Component'
import { ContactFormComponent } from '@/blocks/ContactForm/Component'
import { ContainerBlockComponent } from '@/blocks/Container/Component'
import { FaqListComponent } from '@/blocks/FaqList/Component'
import { NewsletterSignupComponent } from '@/blocks/NewsletterSignup/Component'
import { StatsComponent } from '@/blocks/Stats/Component'
import { TestimonialsComponent } from '@/blocks/Testimonials/Component'
import { VideoEmbedComponent } from '@/blocks/VideoEmbed/Component'
import { WorkHistoryCardComponent } from '@/blocks/WorkHistoryCard/Component'
import { ContentBlockComponent } from '@/blocks/Content/Component'
import { FeatureCardGridComponent } from '@/blocks/FeatureCardGrid/Component'
import { LogoCarouselComponent } from '@/blocks/LogoCarousel/Component'
import { MediaBlockComponent } from '@/blocks/MediaBlock/Component'
import { PhotoStripBlockComponent } from '@/blocks/PhotoStrip/Component'
import { ShaderHeroBlockComponent } from '@/blocks/ShaderHero/Component'
import { SpacerBlockComponent } from '@/blocks/Spacer/Component'
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
 */
export function RenderBlocks({
  blocks,
}: {
  blocks: RenderableBlock[] | null | undefined
}) {
  if (!blocks?.length) return null

  return (
    <Fragment>
      {blocks.map((block, index) => {
        const key = block.id ?? `${block.blockType}-${index}`
        switch (block.blockType) {
          case 'cta':
            return <CallToActionBlockComponent key={key} {...block} />
          case 'container':
            return <ContainerBlockComponent key={key} {...block} />
          case 'content':
            return <ContentBlockComponent key={key} {...block} />
          case 'featureCardGrid':
            return <FeatureCardGridComponent key={key} {...block} />
          case 'logoCarousel':
            return <LogoCarouselComponent key={key} {...block} />
          case 'mediaBlock':
            return <MediaBlockComponent key={key} {...block} />
          case 'photoStrip':
            return <PhotoStripBlockComponent key={key} {...block} />
          case 'shaderHero':
            return <ShaderHeroBlockComponent key={key} {...block} />
          case 'spacer':
            return <SpacerBlockComponent key={key} {...block} />
          case 'articlesArchive':
            return <ArticlesArchiveComponent key={key} {...block} />
          case 'contactForm':
            return <ContactFormComponent key={key} />
          case 'faqList':
            return <FaqListComponent key={key} {...block} />
          case 'newsletterSignup':
            return <NewsletterSignupComponent key={key} />
          case 'stats':
            return <StatsComponent key={key} {...block} />
          case 'testimonials':
            return <TestimonialsComponent key={key} {...block} />
          case 'videoEmbed':
            return <VideoEmbedComponent key={key} {...block} />
          case 'workHistoryCard':
            return <WorkHistoryCardComponent key={key} />
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
      })}
    </Fragment>
  )
}

import type { Block } from 'payload'

import { ArticlesArchive } from '@/blocks/ArticlesArchive/config'
import { CallToAction } from '@/blocks/CallToAction/config'
import { ContactForm } from '@/blocks/ContactForm/config'
import { Container } from '@/blocks/Container/config'
import { Content } from '@/blocks/Content/config'
import { FaqList } from '@/blocks/FaqList/config'
import { FeatureCardGrid } from '@/blocks/FeatureCardGrid/config'
import { LogoCarousel } from '@/blocks/LogoCarousel/config'
import { MediaBlock } from '@/blocks/MediaBlock/config'
import { NewsletterSignup } from '@/blocks/NewsletterSignup/config'
import { PhotoStrip } from '@/blocks/PhotoStrip/config'
import { ShaderHero } from '@/blocks/ShaderHero/config'
import { Spacer } from '@/blocks/Spacer/config'
import { Stats } from '@/blocks/Stats/config'
import { Testimonials } from '@/blocks/Testimonials/config'
import { VideoEmbed } from '@/blocks/VideoEmbed/config'
import { WorkHistoryCard } from '@/blocks/WorkHistoryCard/config'

/**
 * The page-builder block library — the single list every layout-capable
 * surface (Pages `layout`, Posts below-article `layout`) registers, keeping
 * the admin picker, `RenderBlocks`, and Storybook a 1:1 set.
 *
 * @remarks Alphabetical so the admin picker stays scannable as the library
 * grows. Add new blocks here (plus RenderBlocks + a story) — collections
 * pick the list up automatically.
 *
 * `column` is deliberately absent: it exists only inside a `container`, so
 * registering it at root would offer editors a width with nothing to be a
 * share of. `container` itself is here, and is the only layout block.
 */
export const pageBuilderBlocks: Block[] = [
  ArticlesArchive,
  CallToAction,
  ContactForm,
  Container,
  Content,
  FaqList,
  FeatureCardGrid,
  LogoCarousel,
  MediaBlock,
  NewsletterSignup,
  PhotoStrip,
  ShaderHero,
  Spacer,
  Stats,
  Testimonials,
  VideoEmbed,
  WorkHistoryCard,
]

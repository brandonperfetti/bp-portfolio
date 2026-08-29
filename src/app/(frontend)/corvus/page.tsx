import { type Metadata } from 'next'
import { Suspense } from 'react'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { Container } from '@/components/Container'
import CorvusChat from '@/components/CorvusChat'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'

const defaultCorvusMeta: Metadata = {
  title: 'Corvus',
  description:
    'Chat with Corvus using streaming responses and image generation prompts.',
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/corvus')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultCorvusMeta.title),
    fallbackDescription: String(defaultCorvusMeta.description),
    path: '/corvus',
  })
}

/**
 * Placeholder matching CorvusChat's fixed-height frame while the client chat
 * streams in (#76 B3 Suspense isolation). Motion is gated on `motion-safe` to
 * honor `prefers-reduced-motion`.
 */
function CorvusChatSkeleton() {
  return (
    <div
      className="h-full w-full rounded-3xl border border-zinc-200/60 bg-zinc-100/40 motion-safe:animate-pulse dark:border-zinc-700/40 dark:bg-zinc-800/30"
      aria-hidden="true"
    />
  )
}

export default async function CorvusPage() {
  const page = await getCmsPageByPath('/corvus')
  const headingText = page?.title || 'Corvus'
  const subtitleText =
    page?.subtitle ||
    'Prefix your prompt with image: or Dali: to generate an image.'

  return (
    <Container className="py-0">
      {/* CorvusChat now owns the whole identity band — a compact in-card
          agent header (raven avatar, name, subtitle, status dot), not the
          separate hero-style header + constellation backdrop this page used
          to render (Brandon: "went overboard"). This wrapper just supplies
          the atlas palette/fonts and the fixed-height flex frame so the chat
          fills the space and the composer stays pinned at the bottom. No
          background of its own — the chat card sits directly on the site
          page (zinc-50 / black), so there's no darker band behind it. No
          horizontal padding of its own: the surrounding Container already
          aligns content with the rest of the site, so an extra inset here only
          pushed the chat in past every other page's content (Brandon). */}
      <div className="corvus-surface flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden rounded-3xl pt-8 pb-2 sm:h-[calc(100dvh-6.25rem)] sm:pt-10 sm:pb-3">
        <div className="min-h-0 flex-1">
          {/* #76 B3: CorvusChat's `useChat` reads Math.random() (a client
              unstable value) which blocks prerender. Suspense-isolate it so the
              indexed page shell (title/subtitle + CmsPageBlocks) prerenders and
              the chat streams — the route reaches ◐ partial. */}
          <Suspense fallback={<CorvusChatSkeleton />}>
            <CorvusChat title={headingText} subtitle={subtitleText} />
          </Suspense>
        </div>
      </div>
      <CmsPageBlocks slug="corvus" />
    </Container>
  )
}

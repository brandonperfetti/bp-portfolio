import { type Metadata } from 'next'
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
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

/**
 * Corvus visual identity fonts (#78), loaded only for the `.corvus-surface`
 * they're applied to below — everywhere else on the site keeps its default
 * fonts. Weights are trimmed to what the surface actually uses: Fraunces
 * 500/600 for the display wordmark/headings, Instrument Sans 400/500 for
 * body/UI text, JetBrains Mono 400 for `kbd`/label copy. `display: 'swap'`
 * avoids a render-blocking font request.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-corvus-display',
  display: 'swap',
})
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-corvus-body',
  display: 'swap',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-corvus-mono',
  display: 'swap',
})

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
          page (zinc-50 / black), so there's no darker band behind it. */}
      <div
        className={`corvus-surface flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden rounded-3xl px-3 pt-8 pb-2 sm:h-[calc(100dvh-6.25rem)] sm:px-4 sm:pt-10 sm:pb-3 ${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
      >
        <div className="min-h-0 flex-1">
          <CorvusChat title={headingText} subtitle={subtitleText} />
        </div>
      </div>
      <CmsPageBlocks slug="corvus" />
    </Container>
  )
}

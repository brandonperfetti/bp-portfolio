import { type Metadata } from 'next'
import { Fraunces, Instrument_Sans, JetBrains_Mono } from 'next/font/google'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { Container } from '@/components/Container'
import CorvusChat from '@/components/CorvusChat'
import { ConstellationMark } from '@/components/corvus/ConstellationMark'
import { RavenMark } from '@/components/corvus/RavenMark'
import { AnimatedHeadline } from '@/components/motion/AnimatedHeadline'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
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
      <div
        className={`corvus-surface flex h-[calc(100dvh-5.75rem)] min-h-0 flex-col overflow-hidden rounded-3xl bg-[var(--corvus-ground)] px-3 pt-8 pb-2 sm:h-[calc(100dvh-6.25rem)] sm:px-4 sm:pt-10 sm:pb-3 ${fraunces.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
      >
        {/* Compact identity band — a slim header, not a hero: the fixed-
            height flex column below needs the vertical room for the chat
            (CorvusChat fills flex-1). */}
        <div className="relative shrink-0 overflow-hidden rounded-2xl border border-[var(--corvus-border)] bg-[var(--corvus-panel)] px-4 py-3 sm:px-5 sm:py-4">
          <ConstellationMark
            aria-hidden="true"
            className="pointer-events-none absolute -top-4 -right-6 h-28 w-28 text-[var(--corvus-accent)] opacity-[0.14] sm:h-36 sm:w-36"
          />
          <div className="relative flex items-center gap-3">
            <RavenMark
              aria-hidden="true"
              className="h-7 w-7 shrink-0 text-[var(--corvus-accent)] sm:h-8 sm:w-8"
            />
            <div className="min-w-0">
              <AnimatedHeadline
                text={headingText}
                variant="line"
                className="text-2xl font-semibold tracking-tight sm:text-3xl"
              />
              <ScrollReveal y={10} duration={0.6} delay={0.26}>
                <p className="mt-1 text-sm text-[var(--corvus-muted)]">
                  {subtitleText}
                </p>
              </ScrollReveal>
            </div>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1">
          <CorvusChat />
        </div>
      </div>
      <CmsPageBlocks slug="corvus" />
    </Container>
  )
}

import { type Metadata } from 'next'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { NotFoundState } from '@/components/cms/NotFoundState'
import { ShareButton } from '@/components/cms/ShareButton'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { Section } from '@/components/Section'
import { SimpleLayout } from '@/components/SimpleLayout'
import { TechCard } from '@/components/tech/TechCard'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsUses } from '@/lib/cms/usesRepo'
import { getSiteUrl } from '@/lib/site'

const defaultUsesMeta: Metadata = {
  title: 'Uses',
  description: 'Software, hardware, and tools I use to plan, build, and ship.',
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/uses')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultUsesMeta.title),
    fallbackDescription: String(defaultUsesMeta.description),
    path: '/uses',
  })
}

export default async function Uses() {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/uses')
  const cmsUses = await getCmsUses()
  const title = page?.title || String(defaultUsesMeta.title)
  const intro = page?.subtitle || String(defaultUsesMeta.description)
  const sections = cmsUses ?? []

  const normalizedSiteUrl = (settings.canonicalUrl || getSiteUrl()).replace(
    /\/+$/,
    '',
  )
  // Reader Share control, right-aligned below the hero. Resolved server-side
  // (global ± per-page targets); the per-page `disableSharing` kill switch
  // collapses it to [], which hides the button. `ShareButton` — the sole
  // client boundary — receives only serializable props.
  const shareTargetIds = resolvePageShareTargetIds(
    page ?? {},
    settings.shareTargets,
  )
  const shareTitle = page?.seoTitle || String(defaultUsesMeta.title)

  return (
    <SimpleLayout
      title={title}
      intro={intro}
      actions={
        shareTargetIds.length > 0 ? (
          <ShareButton
            url={`${normalizedSiteUrl}/uses`}
            title={shareTitle}
            targetIds={shareTargetIds}
          />
        ) : undefined
      }
    >
      <div className="space-y-20">
        {sections.length ? (
          sections.map((section) => (
            <Section key={section.title} title={section.title}>
              <ScrollReveal targets="li">
                <ul
                  role="list"
                  className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2"
                >
                  {section.items.map((item) => (
                    // Uses entries are logo-less by design — no monogram
                    // circle (Brandon's call; tech cards keep theirs).
                    <TechCard key={item.slug} item={item} monogram={false} />
                  ))}
                </ul>
              </ScrollReveal>
            </Section>
          ))
        ) : (
          <NotFoundState
            title="Uses list coming soon"
            description="I'm putting together the gear, apps, and tools I use day to day. Check back shortly."
          />
        )}
      </div>
      <CmsPageBlocks slug="uses" />
    </SimpleLayout>
  )
}

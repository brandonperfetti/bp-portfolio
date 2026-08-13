import { type Metadata } from 'next'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { NotFoundState } from '@/components/cms/NotFoundState'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { Section } from '@/components/Section'
import { SimpleLayout } from '@/components/SimpleLayout'
import { TechCard } from '@/components/tech/TechCard'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsUses } from '@/lib/cms/usesRepo'

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
  const page = await getCmsPageByPath('/uses')
  const cmsUses = await getCmsUses()
  const title = page?.title || String(defaultUsesMeta.title)
  const intro = page?.subtitle || String(defaultUsesMeta.description)
  const sections = cmsUses ?? []

  return (
    <SimpleLayout title={title} intro={intro}>
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

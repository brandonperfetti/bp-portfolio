import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import { RenderHero } from '@/heros/RenderHero'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import {
  RESERVED_PAGE_SLUGS,
  getPageBySlugDraftAware,
  getPublishedPageSlugs,
} from '@/lib/cms/pagesRepo'
import { getSiteUrl } from '@/lib/site'

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryPageBySlug = cache(getPageBySlugDraftAware)

export async function generateStaticParams() {
  const slugs = await getPublishedPageSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await queryPageBySlug(slug)
  if (!page) return {}
  const settings = await getCmsSiteSettings()
  const base = (settings?.canonicalUrl || getSiteUrl()).replace(/\/+$/, '')
  return {
    title: page.meta?.title || page.title,
    description: page.meta?.description || page.subtitle || undefined,
    alternates: { canonical: `${base}/${slug}` },
  }
}

/**
 * CMS page builder route: any published Pages doc whose slug isn't owned by
 * a dedicated route renders here — hero + layout blocks, fully composed in
 * the admin. New pages need no code or deploy.
 */
export default async function CmsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    notFound()
  }

  const page = await queryPageBySlug(slug)
  if (!page) {
    notFound()
  }

  return (
    <Container className="mt-16 sm:mt-32">
      <RenderHero page={page} />
      <div className="mt-8">
        <RenderBlocks blocks={page.layout} />
      </div>
    </Container>
  )
}

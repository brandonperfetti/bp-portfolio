import type { Metadata } from 'next'
import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'

import configPromise from '@payload-config'
import { RenderBlocks } from '@/blocks/RenderBlocks'
import { Container } from '@/components/Container'
import { RenderHero } from '@/heros/RenderHero'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getSiteUrl } from '@/lib/site'

/**
 * Slugs owned by dedicated route components; the catch-all never renders
 * them (Next static routes win, but generateStaticParams must not emit
 * them either). `home` renders at `/`.
 */
const RESERVED_SLUGS = new Set([
  'home',
  'about',
  'account',
  'articles',
  'hermes',
  'projects',
  'sign-in',
  'sign-up',
  'speaking',
  'tech',
  'thank-you',
  'uses',
])

/**
 * Draft-aware page query for the CMS page builder (catch-all route).
 * Draft mode (admin Live Preview / Preview button) reads the newest draft;
 * visitors only ever see published documents.
 */
const queryPageBySlug = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode()
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: slug } },
  })
  return docs[0] ?? null
})

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 500,
    overrideAccess: false,
    pagination: false,
    select: { slug: true },
  })
  return docs
    .filter((doc) => doc.slug && !RESERVED_SLUGS.has(doc.slug))
    .map((doc) => ({ slug: doc.slug as string }))
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
  if (RESERVED_SLUGS.has(slug)) {
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

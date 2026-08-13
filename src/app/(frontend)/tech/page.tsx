import { NotFoundState } from '@/components/cms/NotFoundState'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'
import { SimpleLayout } from '@/components/SimpleLayout'
import { TechExplorer } from '@/components/tech/TechExplorer'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsTech } from '@/lib/cms/techRepo'
import {
  buildSignalsBySlug,
  getTechSignalsIndex,
} from '@/lib/tech/githubSignals'
import { type Metadata } from 'next'
import { Suspense } from 'react'

const defaultTechMeta: Metadata = {
  title: 'Tech',
  description:
    'Core technologies and tools I reach for when building products.',
}

function TechExplorerFallback() {
  return (
    <div className="rounded-2xl border border-zinc-100 p-4 text-sm text-zinc-500 dark:border-zinc-700/40 dark:text-zinc-400">
      Loading technology explorer...
    </div>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/tech')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultTechMeta.title),
    fallbackDescription: String(defaultTechMeta.description),
    path: '/tech',
  })
}

export default async function TechStack() {
  const page = await getCmsPageByPath('/tech')
  const cmsTech = await getCmsTech()
  // Live GitHub signals (cached 6h); null when GITHUB_OWNER/TOKEN are unset,
  // when the scan times out, or in draft mode (which bypasses the cache and
  // would re-run the full scan per request) — the explorer then renders
  // without activity badges instead of failing or stalling.
  const signalsIndex = await getTechSignalsIndex()
  const items = cmsTech ?? []
  const signals = buildSignalsBySlug(signalsIndex, items)

  return (
    <SimpleLayout
      title={page?.title || 'Core technologies I reach for first.'}
      intro={
        page?.subtitle ||
        'A practical stack for product delivery, engineering execution, and long-term maintainability.'
      }
    >
      {items.length ? (
        <Suspense fallback={<TechExplorerFallback />}>
          <TechExplorer items={items} signals={signals} />
        </Suspense>
      ) : (
        <NotFoundState
          title="Tech stack coming soon"
          description="I'm curating the tools and technologies I reach for. Check back shortly."
        />
      )}
      <CmsPageBlocks slug="tech" />
    </SimpleLayout>
  )
}

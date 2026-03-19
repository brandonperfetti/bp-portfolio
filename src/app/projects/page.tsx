import { type Metadata } from 'next'

import { EntityGrid } from '@/components/cms/EntityGrid'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { SimpleLayout } from '@/components/SimpleLayout'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import { isNotionProvider } from '@/lib/cms/provider'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'

const projects = [
  {
    name: "Brandon Perfetti's Portfolio",
    description: 'Source code for my personal site and content platform.',
    link: {
      href: 'https://github.com/brandonperfetti/bp-portfolio',
      label: 'github.com/brandonperfetti/bp-portfolio',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713915478/bp-portfolio/images/Head_Shot_vvk5yr.png',
  },
  {
    name: 'Top Timelines',
    description: 'Event timelines made simple for teams and organizations.',
    link: { href: 'https://toptimelines.com/', label: 'toptimelines.com' },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1710096798/top-timelines/top_timelines_logo_nzgxaq.svg',
  },
  {
    name: 'Sans Faux Studios',
    description: 'A web studio focused on modern product websites and apps.',
    link: { href: 'https://sansfaux.com/', label: 'sansfaux.com' },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713742159/bp-portfolio/images/logos/favicon_m2unhm.png',
  },
  {
    name: 'Dev Flow',
    description: 'A Stack Overflow style question-and-answer platform.',
    link: {
      href: 'https://devflow-coral2.vercel.app/',
      label: 'devflow-coral2.vercel.app',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1722822416/DevFlow/site-logo_wicnp6.svg',
  },
  {
    name: 'Filmpire',
    description: 'A media experience for exploring and tracking movies.',
    link: {
      href: 'https://filmpire-beta.vercel.app/',
      label: 'filmpire-beta.vercel.app',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1724377796/Filmpire/site-logo_io51hi.svg',
  },
  {
    name: 'EMP Consultants',
    description: 'A modernized web presence for a forensic engineering firm.',
    link: { href: 'https://empconsultants.com/', label: 'empconsultants.com' },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713727772/emp/favicon_jqaems.png',
  },
]

const defaultProjectsMeta: Metadata = {
  title: 'Projects',
  description:
    'Selected products, platforms, and client builds I have shipped or led.',
}

function slugify(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'project'
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/projects')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultProjectsMeta.title),
    fallbackDescription: String(defaultProjectsMeta.description),
    path: '/projects',
  })
}

export default async function Projects() {
  const siteUrl = getSiteUrl()
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')
  const [settings, page, cmsProjects] = await Promise.all([
    getCmsSiteSettings(),
    getCmsPageByPath('/projects'),
    isNotionProvider() ? getCmsProjects() : Promise.resolve(null),
  ])
  const items = cmsProjects
    ? cmsProjects
    : projects.map((project) => ({
        slug: slugify(project.name),
        name: project.name,
        description: project.description,
        logo: project.logo,
        link: project.link,
      }))
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page?.title || 'Projects',
    description: page?.subtitle || defaultProjectsMeta.description,
    url: `${normalizedSiteUrl}/projects`,
    isPartOf: {
      '@type': 'WebSite',
      url: normalizedSiteUrl,
      name: settings.siteName,
    },
  }
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${normalizedSiteUrl}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Projects',
        item: `${normalizedSiteUrl}/projects`,
      },
    ],
  }
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.slice(0, 50).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.link?.href || `${normalizedSiteUrl}/projects`,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(collectionSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumbSchema) }}
      />
      {items.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(itemListSchema) }}
        />
      ) : null}
      <SimpleLayout
        title={
          page?.title ||
          'Selected projects across product, engineering, and consulting work.'
        }
        intro={
          page?.subtitle ||
          'A practical mix of platform builds, client delivery, and product experiments.'
        }
      >
        {items.length ? (
          <EntityGrid items={items} />
        ) : (
          <NotFoundState
            title="No published projects"
            description="No CMS project records are currently publish-safe."
          />
        )}
      </SimpleLayout>
    </>
  )
}

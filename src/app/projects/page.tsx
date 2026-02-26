import { type Metadata } from 'next'

import { EntityGrid } from '@/components/cms/EntityGrid'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { SimpleLayout } from '@/components/SimpleLayout'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import { isNotionProvider } from '@/lib/cms/provider'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'

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
      href: 'https://devflow-coral.vercel.app/',
      label: 'devflow-coral.vercel.app',
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
  const cmsProjects = isNotionProvider() ? await getCmsProjects() : null
  const items = cmsProjects
    ? cmsProjects
    : projects.map((project) => ({
        slug: project.name.toLowerCase().replace(/\s+/g, '-'),
        name: project.name,
        description: project.description,
        logo: project.logo,
        link: project.link,
      }))

  return (
    <SimpleLayout
      title="Selected projects across product, engineering, and consulting work."
      intro="A practical mix of platform builds, client delivery, and product experiments."
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
  )
}

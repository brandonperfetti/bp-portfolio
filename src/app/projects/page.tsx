import { type Metadata } from 'next'
import Image from 'next/image'

import { Card } from '@/components/Card'
import { SimpleLayout } from '@/components/SimpleLayout'

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

function LinkIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M15.712 11.823a.75.75 0 1 0 1.06 1.06l-1.06-1.06Zm-4.95 1.768a.75.75 0 0 0 1.06-1.06l-1.06 1.06Zm-2.475-1.414a.75.75 0 1 0-1.06-1.06l1.06 1.06Zm4.95-1.768a.75.75 0 1 0-1.06 1.06l1.06-1.06Zm3.359.53-.884.884 1.06 1.06.885-.883-1.061-1.06Zm-4.95-2.12 1.414-1.415L12 6.344l-1.415 1.413 1.061 1.061Zm0 3.535a2.5 2.5 0 0 1 0-3.536l-1.06-1.06a4 4 0 0 0 0 5.656l1.06-1.06Zm4.95-4.95a2.5 2.5 0 0 1 0 3.535L17.656 12a4 4 0 0 0 0-5.657l-1.06 1.06Zm1.06-1.06a4 4 0 0 0-5.656 0l1.06 1.06a2.5 2.5 0 0 1 3.536 0l1.06-1.06Zm-7.07 7.07.176.177 1.06-1.06-.176-.177-1.06 1.06Zm-3.183-.353.884-.884-1.06-1.06-.884.883 1.06 1.06Zm4.95 2.121-1.414 1.414 1.06 1.06 1.415-1.413-1.06-1.061Zm0-3.536a2.5 2.5 0 0 1 0 3.536l1.06 1.06a4 4 0 0 0 0-5.656l-1.06 1.06Zm-4.95 4.95a2.5 2.5 0 0 1 0-3.535L6.344 12a4 4 0 0 0 0 5.656l1.06-1.06Zm-1.06 1.06a4 4 0 0 0 5.657 0l-1.061-1.06a2.5 2.5 0 0 1-3.535 0l-1.061 1.06Zm7.07-7.07-.176-.177-1.06 1.06.176.178 1.06-1.061Z"
        fill="currentColor"
      />
    </svg>
  )
}

export const metadata: Metadata = {
  title: 'Projects',
  description:
    'Selected products, platforms, and client builds I have shipped or led.',
}

export default function Projects() {
  return (
    <SimpleLayout
      title="Selected projects across product, engineering, and consulting work."
      intro="A practical mix of platform builds, client delivery, and product experiments."
    >
      <ul
        role="list"
        className="grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3"
      >
        {projects.map((project) => (
          <Card as="li" key={project.name}>
            <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 sm:h-12 sm:w-12 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
              <Image
                src={project.logo}
                alt={project.name}
                width={48}
                height={48}
                className="h-8 w-8 object-contain sm:h-9 sm:w-9"
                unoptimized
              />
            </div>
            <h2 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
              <Card.Link href={project.link.href}>{project.name}</Card.Link>
            </h2>
            <Card.Description>{project.description}</Card.Description>
            <p className="relative z-10 mt-5 flex text-sm font-medium text-zinc-500 transition group-hover:text-teal-500 dark:text-zinc-300">
              <LinkIcon className="h-6 w-6 flex-none" />
              <span className="ml-2">{project.link.label}</span>
            </p>
          </Card>
        ))}
      </ul>
    </SimpleLayout>
  )
}

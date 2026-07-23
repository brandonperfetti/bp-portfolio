import Image, { type ImageProps } from 'next/image'

import { Button } from '@/components/Button'
import { getCmsWorkHistory } from '@/lib/cms/workHistoryRepo'
import { getOptimizedImageUrl } from '@/lib/image-utils'

/**
 * Work-history card (home sidebar + WorkHistory CMS block). Reads the
 * `work-history` collection with the retained v3 hard-coded fallback.
 */

function BriefcaseIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M2.75 9.75a3 3 0 0 1 3-3h12.5a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H5.75a3 3 0 0 1-3-3v-8.5Z"
        className="fill-zinc-100 stroke-zinc-400 dark:fill-zinc-100/10 dark:stroke-zinc-500"
      />
      <path
        d="M3 14.25h6.249c.484 0 .952-.002 1.316.319l.777.682a.996.996 0 0 0 1.316 0l.777-.682c.364-.32.832-.319 1.316-.319H21M8.75 6.5V4.75a2 2 0 0 1 2-2h2.5a2 2 0 0 1 2 2V6.5"
        className="stroke-zinc-400 dark:stroke-zinc-500"
      />
    </svg>
  )
}

function ArrowDownIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.75 8.75 8 12.25m0 0 3.25-3.5M8 12.25v-8.5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Role {
  company: string
  title: string
  logo?: ImageProps['src']
  start: string | { label: string; dateTime: string }
  end: string | { label: string; dateTime: string }
}

function Role({ role }: { role: Role }) {
  const startLabel =
    typeof role.start === 'string' ? role.start : role.start.label
  const startDate =
    typeof role.start === 'string' ? role.start : role.start.dateTime

  const endLabel = typeof role.end === 'string' ? role.end : role.end.label
  const endDate = typeof role.end === 'string' ? role.end : role.end.dateTime

  return (
    <li className="flex gap-4">
      <div className="relative mt-1 flex h-10 w-10 flex-none items-center justify-center rounded-full shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
        {role.logo ? (
          <Image
            src={
              typeof role.logo === 'string'
                ? getOptimizedImageUrl(role.logo, {
                    width: 96,
                    height: 96,
                    crop: 'fit',
                  })
                : role.logo
            }
            alt=""
            width={100}
            height={100}
            sizes="(min-width: 640px) 2.25rem, 2rem"
            className="h-7 w-auto max-w-7 object-contain"
          />
        ) : (
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {role.company.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <dl className="flex flex-auto flex-wrap gap-x-2">
        <dt className="sr-only">Company</dt>
        <dd className="w-full flex-none text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {role.company}
        </dd>
        <dt className="sr-only">Role</dt>
        <dd className="text-xs text-zinc-500 dark:text-zinc-400">
          {role.title}
        </dd>
        <dt className="sr-only">Date</dt>
        <dd
          className="ml-auto text-xs text-zinc-500 dark:text-zinc-400"
          aria-label={`${startLabel} until ${endLabel}`}
        >
          <time dateTime={startDate}>{startLabel}</time>{' '}
          <span aria-hidden="true">-</span>{' '}
          <time dateTime={endDate}>{endLabel}</time>
        </dd>
      </dl>
    </li>
  )
}

const defaultResume: Array<Role> = [
  {
    company: 'Brytecore',
    title: 'Senior Frontend Engineer',
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1774040299/bp-portfolio/logos/footer-brytecore-bug_xsf8iw.webp',
    start: '2024',
    end: {
      label: 'Present',
      dateTime: new Date().getFullYear().toString(),
    },
  },
  {
    company: 'Lone Wolf Technologies',
    title: 'Technical PM + Software Engineer',
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562788/bp-portfolio/images/logos/lone-wolf_hpftff_fsqe3o.png',
    start: '2021',
    end: '2023',
  },
  {
    company: 'W+R Studios',
    title: 'Technical PM + Senior Data Integrations Engineer',
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
    start: '2017',
    end: '2020',
  },
  {
    company: 'W+R Studios',
    title: 'Technical PM + Data Integrations Engineer',
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
    start: '2013',
    end: '2017',
  },
]

export async function Resume() {
  const cmsResume = await getCmsWorkHistory()
  const resume: Array<Role> = cmsResume?.length
    ? cmsResume.map((entry) => ({
        company: entry.company,
        title: entry.title,
        logo: entry.logo,
        start: entry.start,
        end: entry.end,
      }))
    : defaultResume

  return (
    <div className="rounded-2xl border border-zinc-100 p-6 dark:border-zinc-700/40">
      <h2 className="flex text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <BriefcaseIcon className="h-6 w-6 flex-none" />
        <span className="ml-3">Work</span>
      </h2>
      <ol className="mt-6 space-y-4">
        {resume.map((role, roleIndex) => (
          <Role key={roleIndex} role={role} />
        ))}
      </ol>
      <Button
        href="/assets/Brandon_Perfetti_Resume.pdf"
        variant="secondary"
        className="group mt-6 w-full"
      >
        Download CV
        <ArrowDownIcon className="h-4 w-4 stroke-zinc-400 transition group-active:stroke-zinc-600 dark:group-hover:stroke-zinc-50 dark:group-active:stroke-zinc-50" />
      </Button>
    </div>
  )
}

import { ArrowDownIcon } from '@/icons/ArrowDownIcon'
import { BriefcaseIcon } from '@/icons/BriefcaseIcon'
import Image, { ImageProps } from 'next/image'
import Button from './Button'

interface Role {
  company: string
  title: string
  logo: ImageProps['src']
  start: string | { label: string; dateTime: string }
  end: string | { label: string; dateTime: string }
}

function Role({ role }: { role: Role }) {
  let startLabel =
    typeof role.start === 'string' ? role.start : role.start.label
  let startDate =
    typeof role.start === 'string' ? role.start : role.start.dateTime

  let endLabel = typeof role.end === 'string' ? role.end : role.end.label
  let endDate = typeof role.end === 'string' ? role.end : role.end.dateTime

  return (
    <li className="flex gap-4">
      <div className="relative mt-1 flex h-10 w-10 flex-none items-center justify-center rounded-full shadow-md shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
        <Image
          height={100}
          width={100}
          src={role.logo}
          alt=""
          className="h-7 w-7"
          unoptimized
        />
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
          className="ml-auto text-xs text-zinc-400 dark:text-zinc-500"
          aria-label={`${startLabel} until ${endLabel}`}
        >
          <time dateTime={startDate}>{startLabel}</time>{' '}
          <span aria-hidden="true">—</span>{' '}
          <time dateTime={endDate}>{endLabel}</time>
        </dd>
      </dl>
    </li>
  )
}

export default function Resume() {
  let resume: Array<Role> = [
    {
      company: 'Freelance',
      title: 'Technical Product Manager + Software Engineer',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1706646186/bp-spotlight/images/logos/rocket-7757105_640_lcepwk.png',
      start: '2023',
      end: {
        label: 'Present',
        dateTime: new Date().getFullYear().toString(),
      },
    },
    {
      company: 'Lone Wolf Technologies',
      title: 'Technical Product Manager + Software Engineer',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142686/bp-spotlight/images/logos/lone-wolf_hpftff.svg',
      start: '2021',
      end: '2023',
    },
    {
      company: 'W+R Studios',
      title: 'Technical Project Manager + Senior Data Integrations Engineer',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      start: '2017',
      end: '2020',
    },
    {
      company: 'W+R Studios',
      title: 'Technical Project Manager + Custom Theme Developer',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      start: '2015',
      end: '2017',
    },
    {
      company: 'W+R Studios',
      title: 'Technical Project Manager + Data Integrations Engineer',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      start: '2013',
      end: '2015',
    },
    {
      company: 'W+R Studios',
      title: 'Manager, Product Support',
      logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      start: '2012',
      end: '2013',
    },
  ]

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
      <div className="mt-6">
        <Button
          as="a"
          fullWidth
          // @ts-ignore
          href="assets/Brandon_Perfetti_Technical_PM.pdf"
          variant="secondary"
          className="group mt-6 w-full"
        >
          Download CV
          <ArrowDownIcon className="h-4 w-4 stroke-zinc-400 transition group-active:stroke-zinc-600 dark:group-hover:stroke-zinc-50 dark:group-active:stroke-zinc-50" />
        </Button>
      </div>
    </div>
  )
}

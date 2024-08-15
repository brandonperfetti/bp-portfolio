import { type Metadata } from 'next'
import Image from 'next/image'

import { SimpleLayout } from '@/components/common'
import { Card } from '@/components/common/Card'
import { LinkIcon } from '@/icons'

const projects = [
  {
    name: `Brandon Perfetti's Portfolio`,
    description: 'Sorce code for my digital playground.',
    link: {
      href: 'https://github.com/brandonperfetti/bp-portfolio',
      label: 'github.com/brandonperfetti/bp-portfolio',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713915478/bp-portfolio/images/Head_Shot_vvk5yr.png',
  },
  {
    name: `Dev Flow`,
    description: 'A Stack Overflow Clone',
    link: {
      href: 'https://devflow-coral.vercel.app/',
      label: 'devflow.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1722822416/DevFlow/site-logo_wicnp6.svg',
  },
  {
    name: 'Top Timelines - In Progress',
    description: 'Event timelines made simple for anyone',
    link: {
      href: 'https://toptimelines.com/',
      label: 'toptimelines.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1710096798/top-timelines/top_timelines_logo_nzgxaq.svg',
  },
  {
    name: 'Sans Faux Studios',
    description:
      'A premier web development studio specializing in modern web technologies and design.',
    link: {
      href: 'https://sansfaux.com/',
      label: 'sansfaux.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713742159/bp-portfolio/images/logos/favicon_m2unhm.png',
  },
  {
    name: 'EMP Consultants',
    description: 'A design and forensic engineering firm',
    link: {
      href: 'https://empconsultants.com/',
      label: 'empconsultants.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713727772/emp/favicon_jqaems.png',
  },
  {
    name: 'BEAUTY By Casey Lauren',
    description: 'Event stylist landing page built with Gatsby.js and Netlify',
    link: {
      href: 'https://beautybycaseylauren.com/',
      label: 'beautybycaseylauren.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142669/bp-spotlight/images/logos/bbcl_pacmya.svg',
  },
  // {
  //   name: 'Taoist Programmer',
  //   description: 'Digital thought garden built with Gatsby.js and Netlify',
  //   link: {
  //     href: 'https://taoistprogrammer.com/',
  //     label: 'taoistprogrammer.com',
  //   },
  //   logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562731/bp-portfolio/images/logos/taoist-programmer_qhjxlo_q4g7gx.png',
  // },
  // {
  //   name: 'Taoist Shop',
  //   description:
  //     'eCommerce Webstore built with Gatsby.js, Shopify Storefront API, and Netlify',
  //   link: {
  //     href: 'https://shop.taoistprogrammer.com/',
  //     label: 'shop.taoistprogrammer.com',
  //   },
  //   logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562731/bp-portfolio/images/logos/taoist-programmer_qhjxlo_q4g7gx.png',
  // },
  {
    name: 'Slicks Slices',
    description:
      'Local Eatery Webstore built with Gatsby.js, Sanity.io, and Netlify',
    link: {
      href: 'https://slicks-slices-brandon.netlify.app/',
      label: 'slicks.slices',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142712/bp-spotlight/images/logos/slicks-slices_c3v31k.svg',
  },
  {
    name: 'Slick Fits',
    description:
      'eCommerce web store built with React, GraphQL, Next.js, Apollo, Keystone.js, Netlify, and Digital Ocean',
    link: {
      href: 'https://slickfits.shop/',
      label: 'slickfits.shop',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562756/bp-portfolio/images/logos/slick-fits_cbsksm_mbtv0i.png',
  },
  {
    name: `Dang That's Delicious`,
    description:
      'Restaurant Review App built with Express.js MongoDB, and Digital Ocean',
    link: {
      href: 'https://octopus-app-jtjlf.ondigitalocean.app/',
      label: 'dang-delicious.app',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684608748/doughnut_uwkna5.png',
  },
  // {
  //   name: `Resume Builder`,
  //   description:
  //     "Resume Builder App with built Next.js, Tailwind CSS, Open AI, Vercel, and Digital Ocean",
  //   link: {
  //     href: "https://resume-builder-ai.vercel.app/",
  //     label: "resume-builder-ai.app",
  //   },
  //   logo: "https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684609674/cv2_euvxyv.svg",
  // },
]

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Things I’ve made trying to put my dent in the universe.',
}

export default function Projects() {
  return (
    <SimpleLayout
      title="Things I’ve made trying to put my dent in the universe."
      intro="I’ve worked on tons of little projects over the years but these are the ones that I’m most proud of. Many of them are open-source, so if you see something that piques your interest, check out the code and contribute if you have ideas for how it can be improved."
    >
      <ul
        role="list"
        className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3"
      >
        {projects.map((project) => (
          <Card as="li" key={project.name}>
            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
              <Image
                src={project.logo}
                alt=""
                width={48}
                height={48}
                className="h-8 w-8"
                unoptimized
              />
            </div>
            <h2 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
              <Card.Link href={project.link.href}>{project.name}</Card.Link>
            </h2>
            <Card.Description>{project.description}</Card.Description>
            <p className="relative z-10 mt-6 flex text-sm font-medium text-zinc-400 transition group-hover:text-teal-500 dark:text-zinc-200">
              <LinkIcon className="h-6 w-6 flex-none" />
              <span className="ml-2">{project.link.label}</span>
            </p>
          </Card>
        ))}
      </ul>
    </SimpleLayout>
  )
}

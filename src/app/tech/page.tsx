import { Card } from '@/components/Card'
import { SimpleLayout } from '@/components/SimpleLayout'
import { LinkIcon } from '@/icons/LinkIcon'
import { Metadata } from 'next'
import Image from 'next/image'

const techStack = [
  {
    name: 'JavaScript',
    description:
      'JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions. While it is most well-known as the scripting language for Web pages, many non-browser environments also use it, such as Node.js, Apache CouchDB and Adobe Acrobat. JavaScript is a prototype-based, multi-paradigm, single-threaded, dynamic language, supporting object-oriented, imperative, and declarative (e.g. functional programming) styles.',
    link: {
      href: 'https://developer.mozilla.org/en-US/docs/Web/javascript',
      label: 'JavaScript Docs',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142672/bp-spotlight/images/logos/javascript_z0s7rb.svg',
  },
  {
    name: 'TypeScript',
    description:
      'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
    link: {
      href: 'https://www.typescriptlang.org/',
      label: 'typescriptlang.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142704/bp-spotlight/images/logos/typescript_yxn0ph.svg',
  },
  {
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    link: {
      href: 'https://nodejs.org/en/',
      label: 'nodejs.org/en',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142688/bp-spotlight/images/logos/node_cc9ada.svg',
  },
  {
    name: 'Express.js',
    description:
      'Express is a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.',
    link: {
      href: 'https://expressjs.com/',
      label: 'expressjs.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684611833/expressjs-transparent-final_bf5dwz.svg',
  },
  {
    name: 'React',
    description:
      'React is a free and open-source front-end JavaScript library for building user interfaces based on components. ',
    link: {
      href: 'https://reactjs.org/',
      label: 'reactjs.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142699/bp-spotlight/images/logos/react_vyeal3.svg',
  },
  {
    name: 'Next.js',
    description: `Used by some of the world's largest companies, Next.js enables you to create full-stack web applications by extending the latest React features, and integrating powerful Rust-based JavaScript tooling for the fastest builds.`,
    link: {
      href: 'https://nextjs.org/',
      label: 'nextjs.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142687/bp-spotlight/images/logos/next_kbzxt2.svg',
  },
  {
    name: 'Vite',
    description: `Vite (French word for "quick", pronounced /vit/, like "veet") is a build tool that aims to provide a faster and leaner development experience for modern web projects. It consists of two major parts: A dev server that provides rich feature enhancements over native ES modules, for example extremely fast Hot Module Replacement (HMR). A build command that bundles your code with Rollup, pre-configured to output highly optimized static assets for production.`,
    link: {
      href: 'https://vitejs.dev/',
      label: 'vitejs.dev',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683144618/bp-spotlight/images/logos/vite_pigseb.svg',
  },
  {
    name: 'Remix',
    description:
      'Remix is a full stack web framework that lets you focus on the user interface and work back through web standards to deliver a fast, slick, and resilient user experience. People are gonna love using your stuff.',
    link: {
      href: 'https://remix.run/',
      label: 'remix.run',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142699/bp-spotlight/images/logos/remix_ftux3w.svg',
  },
  {
    name: 'Gatsby',
    description:
      'Gatsby enables developers to build fast, secure, and powerful websites using a React-based framework and innovative data layer that makes integrating different content, APIs, and services into one web experience incredibly simple.',
    link: {
      href: 'https://www.gatsbyjs.com/',
      label: 'gatsbyjs.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684610457/gatsbyjs-icon_kfk1v5.png',
  },
  {
    name: 'NPM',
    description: `npm is the world's largest software registry. Open source developers from every continent use npm to share and borrow packages, and many organizations use npm to manage private development as well.`,
    link: {
      href: 'https://www.npmjs.com/',
      label: 'npmjs.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142687/bp-spotlight/images/logos/npm_yuikai.svg',
  },
  {
    name: 'Yarn',
    description: `Yarn is a package manager that doubles down as project manager. Whether you work on one-shot projects or large monorepos, as a hobbyist or an enterprise user, we've got you covered.`,
    link: {
      href: 'https://yarnpkg.com/',
      label: 'yarnpkg.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683144622/bp-spotlight/images/logos/yarn_x547mr.svg',
  },
  {
    name: 'GraphQL',
    description:
      'GraphQL is a query language for APIs and a runtime for fulfilling those queries with your existing data. GraphQL provides a complete and understandable description of the data in your API, gives clients the power to ask for exactly what they need and nothing more, makes it easier to evolve APIs over time, and enables powerful developer tools.',
    link: {
      href: 'https://graphql.org/',
      label: 'graphql.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142685/bp-spotlight/images/logos/graphql_caswqs.svg',
  },
  {
    name: 'React Query',
    description:
      'Fetch, cache and update data in your React and React Native applications all without touching any "global state".',
    link: {
      href: 'https://react-query-v3.tanstack.com/',
      label: 'react-query-v3.tanstack.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142701/bp-spotlight/images/logos/react-query_kyroff.svg',
  },
  {
    name: 'React Router',
    description: `React Router enables "client side routing". Client side routing allows your app to update the URL from a link click without making another request for another document from the server. Instead, your app can immediately render some new UI and make data requests with fetch to update the page with new information.`,
    link: {
      href: 'https://reactrouter.com/en/main',
      label: 'reactrouter.com/en/main/',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142697/bp-spotlight/images/logos/react-router_uyt6d7.svg',
  },
  {
    name: 'Tailwind CSS',
    description:
      'Tailwind CSS works by scanning all of your HTML files, JavaScript components, and any other templates for class names, generating the corresponding styles and then writing them to a static CSS file.',
    link: {
      href: 'https://tailwindcss.com/',
      label: 'tailwindcss.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142707/bp-spotlight/images/logos/tailwind_pho1an.svg',
  },
  {
    name: 'Tailwind UI',
    description:
      'Beautifully designed, expertly crafted components and templates, built by the makers of Tailwind CSS. The perfect starting point for your next project.',
    link: {
      href: 'https://tailwindui.com/',
      label: 'tailwindui.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142707/bp-spotlight/images/logos/tailwind_pho1an.svg',
  },
  {
    name: 'Headless UI',
    description:
      'Completely unstyled, fully accessible UI components, designed to integrate beautifully with Tailwind CSS.',
    link: {
      href: 'https://headlessui.com/',
      label: 'headlessui.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142680/bp-spotlight/images/logos/headless-ui_uidjre.svg',
  },
  {
    name: 'Keystone.js',
    description: `Keystone helps you build faster and scale further than any other CMS or App Framework. Just describe your schema, and get a powerful GraphQL API & beautiful Management UI for content and data.`,
    link: {
      href: 'https://keystonejs.com/',
      label: 'keystonejs.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142676/bp-spotlight/images/logos/keystone_bxxo3i.svg',
  },
  {
    name: 'MongoDB Atlas',
    description: `The multi-cloud developer data platform.
An integrated suite of cloud database and data services to accelerate and simplify how you build with data.`,
    link: {
      href: 'https://www.mongodb.com/atlas',
      label: 'mongodb.com/atlas',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142685/bp-spotlight/images/logos/mongo-db_qafkxh.svg',
  },
  {
    name: 'Supabase',
    description: `Supabase is an open source Firebase alternative. Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime subscriptions, and Storage.`,
    link: {
      href: 'https://supabase.com/',
      label: 'supabase.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142706/bp-spotlight/images/logos/supabase_wptfvp.svg',
  },
  {
    name: 'Netlify',
    description:
      'Netlify is a global, production-ready environment from the start. Skip all the server setup and get straight to building.',
    link: {
      href: 'https://www.netlify.com/',
      label: 'netlify.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142683/bp-spotlight/images/logos/netlify_o47xmq.svg',
  },
  {
    name: 'Digital Ocean',
    description:
      'DigitalOcean is the easiest ☁️ platform to deploy, manage & scale applications of any size.',
    link: {
      href: 'https://www.digitalocean.com/',
      label: 'digitalocean.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684609938/digitalocean-icon_dnkqfc.png',
  },
  {
    name: 'Vercel',
    description:
      'Vercel is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration. We enable teams to iterate quickly and develop, preview, and ship delightful user experiences. Vercel has zero-configuration support for 35+ frontend frameworks and integrates with your headless content, commerce, or database of choice.',
    link: {
      href: 'https://vercel.com/',
      label: 'vercel.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683144617/bp-spotlight/images/logos/vercel_yonasw.svg',
  },
]

export const metadata: Metadata = {
  title: 'Tech Stack',
  description: 'A blacksmith is nothing without his tools.',
}

export default function TechStack() {
  return (
    <>
      <SimpleLayout
        title="A blacksmith is nothing without his tools."
        intro="Each project demands a unique mixture of Browser, Programming Language, Framework, Database, Web Server, and Operating System. I've grown accustom to reaching for these technologies first."
      >
        <ul
          role="list"
          className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3"
        >
          {techStack.map((tech) => (
            <Card className="" as="li" key={tech.name}>
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md shadow-zinc-800/5 ring-1 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
                <Image
                  height={48}
                  width={48}
                  src={tech.logo}
                  alt=""
                  className="h-8 w-8"
                  unoptimized
                />
              </div>
              <h2 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
                <Card.Link href={tech.link.href}>{tech.name}</Card.Link>
              </h2>
              <Card.Description>{tech.description}</Card.Description>
              <p className="relative z-10 mt-6 flex text-sm font-medium text-zinc-400 transition group-hover:text-teal-500 dark:text-zinc-200">
                <LinkIcon className="h-6 w-6 flex-none" />
                <span className="ml-2">{tech.link.label}</span>
              </p>
            </Card>
          ))}
        </ul>
      </SimpleLayout>
    </>
  )
}

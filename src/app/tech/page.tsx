import { SimpleLayout } from '@/components/common'
import { Card } from '@/components/common/Card'
import { LinkIcon } from '@/icons'
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
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562757/bp-portfolio/images/logos/javascript_z0s7rb_ym7vtr.svg',
  },
  {
    name: 'TypeScript',
    description:
      'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale.',
    link: {
      href: 'https://www.typescriptlang.org/',
      label: 'typescriptlang.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562753/bp-portfolio/images/logos/typescript_yxn0ph_yru0kc.png',
  },
  {
    name: 'Node.js',
    description:
      'Node.js® is an open-source, cross-platform JavaScript runtime environment.',
    link: {
      href: 'https://nodejs.org/en/',
      label: 'nodejs.org/en',
    },
    logo: 'https://avatars.githubusercontent.com/u/9950313?s=200&v=4',
  },
  {
    name: 'Express.js',
    description:
      'Express is a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.',
    link: {
      href: 'https://expressjs.com/',
      label: 'expressjs.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/5658226?s=48&v=4',
  },
  {
    name: 'React',
    description:
      'React is a free and open-source front-end JavaScript library for building user interfaces based on components.',
    link: {
      href: 'https://reactjs.org/',
      label: 'reactjs.org',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562805/bp-portfolio/images/logos/react_vyeal3_evwomt.png',
  },
  {
    name: 'Redux',
    description:
      'Redux is a JS library for predictable and maintainable global state management.',
    link: {
      href: 'https://redux.js.org/',
      label: 'redux.js.org',
    },
    logo: 'https://avatars.githubusercontent.com/u/13142323?s=48&v=4',
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
    logo: 'https://avatars.githubusercontent.com/u/65625612?s=48&v=4',
  },
  {
    name: 'Remix',
    description:
      'Remix is a full stack web framework that lets you focus on the user interface and work back through web standards to deliver a fast, slick, and resilient user experience. People are gonna love using your stuff.',
    link: {
      href: 'https://remix.run/',
      label: 'remix.run',
    },
    logo: 'https://avatars.githubusercontent.com/u/64235328?s=48&v=4',
  },
  {
    name: 'The Epic Stack',
    description:
      'An opinionated project starter and reference that allows teams to ship their ideas to production faster and on a more stable foundation.',
    link: {
      href: 'https://www.epicweb.dev/epic-stack',
      label: 'epicweb.dev/epic-stack',
    },
    logo: 'https://avatars.githubusercontent.com/u/112979997?s=48&v=4',
  },
  {
    name: 'Vue.js',
    description:
      'The Progressive JavaScript Framework.An approachable, performant and versatile framework for building web user interfaces.',
    link: {
      href: 'https://vuejs.org/',
      label: 'vuejs.org',
    },
    logo: 'https://avatars.githubusercontent.com/u/6128107?s=48&v=4',
  },
  {
    name: 'Pinia',
    description:
      'The intuitive store for Vue.js.Type Safe, Extensible, and Modular by design. Forget you are even using a store.',
    link: {
      href: 'https://pinia.vuejs.org/',
      label: 'pinia.vuejs.org',
    },
    logo: 'https://pinia.vuejs.org/logo.svg',
  },
  {
    name: 'Nuxt',
    description:
      'The Intuitive Vue Framework. Nuxt is an open source framework that makes web development intuitive and powerful. Create performant and production-grade full-stack web apps and websites with confidence.',
    link: {
      href: 'https://nuxt.com/',
      label: 'nuxt.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/23360933?s=48&v=4',
  },
  {
    name: 'Gatsby',
    description:
      'Gatsby enables developers to build fast, secure, and powerful websites using a React-based framework and innovative data layer that makes integrating different content, APIs, and services into one web experience incredibly simple.',
    link: {
      href: 'https://www.gatsbyjs.com/',
      label: 'gatsbyjs.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/12551863?s=48&v=4',
  },
  {
    name: 'NPM',
    description: `npm is the world's largest software registry. Open source developers from every continent use npm to share and borrow packages, and many organizations use npm to manage private development as well.`,
    link: {
      href: 'https://www.npmjs.com/',
      label: 'npmjs.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/6078720?s=48&v=4',
  },
  {
    name: 'Yarn',
    description: `Yarn is a package manager that doubles down as project manager. Whether you work on one-shot projects or large monorepos, as a hobbyist or an enterprise user, we've got you covered.`,
    link: {
      href: 'https://yarnpkg.com/',
      label: 'yarnpkg.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/22247014?s=48&v=4',
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
    name: 'TanStack',
    description:
      'High-quality open-source software for web developers. Headless, type-safe, & powerful utilities for Web Applications, Routing, State Management, Data Visualization, Datagrids/Tables, and more.',
    link: {
      href: 'https://tanstack.com/',
      label: 'tanstack.com',
    },
    logo: 'https://tanstack.com/_build/assets/logo-color-100w-lPbOTx1K.png',
  },
  {
    name: 'React Router',
    description: `React Router enables "client side routing". Client side routing allows your app to update the URL from a link click without making another request for another document from the server. Instead, your app can immediately render some new UI and make data requests with fetch to update the page with new information.`,
    link: {
      href: 'https://reactrouter.com/en/main',
      label: 'reactrouter.com/en/main/',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562763/bp-portfolio/images/logos/react-router_uyt6d7_iwvgkd.png',
  },
  {
    name: 'Tailwind CSS',
    description:
      'Tailwind CSS works by scanning all of your HTML files, JavaScript components, and any other templates for class names, generating the corresponding styles and then writing them to a static CSS file.',
    link: {
      href: 'https://tailwindcss.com/',
      label: 'tailwindcss.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/67109815?s=48&v=4',
  },
  {
    name: 'Tailwind UI',
    description:
      'Beautifully designed, expertly crafted components and templates, built by the makers of Tailwind CSS. The perfect starting point for your next project.',
    link: {
      href: 'https://tailwindui.com/',
      label: 'tailwindui.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/67109815?s=48&v=4',
  },
  {
    name: 'Headless UI',
    description:
      'Completely unstyled, fully accessible UI components, designed to integrate beautifully with Tailwind CSS.',
    link: {
      href: 'https://headlessui.com/',
      label: 'headlessui.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562806/bp-portfolio/images/logos/headless-ui_uidjre_i0qtak.png',
  },
  {
    name: 'Radix UI',
    description:
      'Components, icons, colors, and templates for building high-quality, accessible UI. Free and open-source.',
    link: {
      href: 'https://www.radix-ui.com/',
      label: 'www.radix-ui',
    },
    logo: 'https://avatars.githubusercontent.com/u/75042455?s=48&v=4',
  },
  {
    name: 'shadcn/ui',
    description:
      'Build your component library. Beautifully designed components that you can copy and paste into your apps.',
    link: {
      href: 'https://ui.shadcn.com/',
      label: 'ui.shadcn.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/139895814?s=48&v=4',
  },
  {
    name: 'Jest',
    description: `Jest is a delightful JavaScript Testing Framework with a focus on simplicity. It works with projects using: Babel, TypeScript, Node, React, Angular, Vue and more!`,
    link: {
      href: 'https://jestjs.io/',
      label: 'jestjs.io',
    },
    logo: 'https://avatars.githubusercontent.com/u/103283236?s=48&v=4',
  },
  {
    name: 'Playwright',
    description: `Playwright Test was created specifically to accommodate the needs of end-to-end testing. Playwright supports all modern rendering engines including Chromium, WebKit, and Firefox. Test on Windows, Linux, and macOS, locally or on CI, headless or headed with native mobile emulation of Google Chrome for Android and Mobile Safari.`,
    link: {
      href: 'https://playwright.dev/',
      label: 'playwright.dev',
    },
    logo: 'https://playwright.dev/img/playwright-logo.svg',
  },
  {
    name: 'Testing Library',
    description: `Simple and complete testing utilities that encourage good testing practices`,
    link: {
      href: 'https://testing-library.com/',
      label: 'testing-library.com',
    },
    logo: 'https://testing-library.com/img/octopus-64x64.png',
  },
  {
    name: 'Vitest',
    description: `Next Generation Testing Framework. A Vite-native testing framework. It's fast!`,
    link: {
      href: 'https://vitest.dev/',
      label: 'vitest.dev',
    },
    logo: 'https://avatars.githubusercontent.com/u/95747107?s=48&v=4',
  },
  {
    name: 'Clerk',
    description: `The most comprehensive User Management Platform. Need more than just a sign-in box? Clerk is a complete suite of embeddable UIs, flexible APIs, and admin dashboards to authenticate and manage your users.`,
    link: {
      href: 'https://clerk.com/',
      label: 'clerk.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/49538330?s=48&v=4',
  },
  {
    name: 'Keystone.js',
    description: `Keystone helps you build faster and scale further than any other CMS or App Framework. Just describe your schema, and get a powerful GraphQL API & beautiful Management UI for content and data.`,
    link: {
      href: 'https://keystonejs.com/',
      label: 'keystonejs.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562766/bp-portfolio/images/logos/keystone_bxxo3i_kqzgqt.png',
  },
  {
    name: 'MongoDB Atlas',
    description: `The multi-cloud developer data platform. An integrated suite of cloud database and data services to accelerate and simplify how you build with data.`,
    link: {
      href: 'https://www.mongodb.com/atlas',
      label: 'mongodb.com/atlas',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562806/bp-portfolio/images/logos/mongo-db_qafkxh_zrwhsd.svg',
  },
  {
    name: 'Supabase',
    description: `Supabase is an open source Firebase alternative. Start your project with a Postgres database, Authentication, instant APIs, Edge Functions, Realtime subscriptions, and Storage.`,
    link: {
      href: 'https://supabase.com/',
      label: 'supabase.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562759/bp-portfolio/images/logos/supabase_wptfvp_lwhtvr.png',
  },
  {
    name: 'Resend',
    description: `Email for developers. The best way to reach humans instead of spam folders. Deliver transactional and marketing emails at scale.`,
    link: {
      href: 'https://resend.com/',
      label: 'resend.com',
    },
    logo: 'https://avatars.githubusercontent.com/u/109384852?s=200&v=4',
  },
  {
    name: 'Zod',
    description: `Zod is a TypeScript-first schema declaration and validation library. I'm using the term "schema" to broadly refer to any data type, from a simple string to a complex nested object.`,
    link: {
      href: 'https://zod.dev/',
      label: 'zod.dev',
    },
    logo: 'https://zod.dev/logo.svg',
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
    name: 'Fly.io',
    description:
      'Scalable Full Stack Without the Cortisol. Over 3 million apps have launched on Fly.io, boosted by global Anycast load-balancing, zero-configuration private networking, hardware isolation, and instant WireGuard VPN connections. Push-button deployments that scale to thousands of instances.',
    link: {
      href: 'https://fly.io/',
      label: 'fly.io',
    },
    logo: 'https://avatars.githubusercontent.com/u/22525303?s=48&v=4',
  },
  {
    name: 'Netlify',
    description:
      'Netlify is a global, production-ready environment from the start. Skip all the server setup and get straight to building.',
    link: {
      href: 'https://www.netlify.com/',
      label: 'netlify.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562760/bp-portfolio/images/logos/netlify_o47xmq_gb6pmb.png',
  },
  {
    name: 'Vercel',
    description:
      'Vercel is the platform for frontend developers, providing the speed and reliability innovators need to create at the moment of inspiration. We enable teams to iterate quickly and develop, preview, and ship delightful user experiences. Vercel has zero-configuration support for 35+ frontend frameworks and integrates with your headless content, commerce, or database of choice.',
    link: {
      href: 'https://vercel.com/',
      label: 'vercel.com',
    },
    logo: 'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562737/bp-portfolio/images/logos/vercel_yonasw_renij3.png',
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
                  className="roudned h-8 w-8"
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

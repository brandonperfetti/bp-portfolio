import { createHash } from 'node:crypto'
import path from 'path'
import type { Where } from 'payload'
import { getPayload } from 'payload'

import config from '../src/payload.config'

/**
 * One-time seed: Notion planning-DB content (Tech, Uses, Projects, Work
 * History) into Payload. The dataset is EMBEDDED below — pulled from the
 * "Portfolio CMS - *" Notion databases on 2026-07-23 via MCP — so no
 * NOTION_* env vars are needed. Published rows only; the Archived Freelance
 * work entry is intentionally excluded and the live-site "Engneer" typo is
 * corrected.
 *
 * Usage (against the target DB):
 *   DRY_RUN=true pnpm payload run scripts/seed-cms-from-notion.ts
 *   pnpm payload run scripts/seed-cms-from-notion.ts
 *
 * Idempotent: upserts by natural key (tech: name, uses: title, projects:
 * slug, work-history: company+title). Logos download from their source URLs
 * and upload to Media/Blob once (cached per URL within a run; re-runs reuse
 * an existing media doc matched by a URL-unique filename key — parent path
 * segment + basename + URL hash, because basenames alone collide: every
 * tech logo lives at .../tech/<name>/logo.svg. A legacy fallback matches
 * pre-fix docs by old basename key + exact alt so they aren't re-uploaded).
 */

const DRY_RUN = process.env.DRY_RUN === 'true'

const SEED = {
  tech: [
    {
      name: 'JavaScript',
      category: 'frontend',
      notes: 'Core language for frontend and backend web development.',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397813/bp-portfolio/tech/javascript/logo.svg',
      sortOrder: 1,
      featured: true,
    },
    {
      name: 'TypeScript',
      category: 'frontend',
      notes: 'Strongly typed JavaScript for safer, scalable web apps.',
      url: 'https://www.typescriptlang.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397816/bp-portfolio/tech/typescript/logo.png',
      sortOrder: 2,
      featured: true,
    },
    {
      name: 'Node.js',
      category: 'backend',
      notes: 'JavaScript runtime for backend services and tooling.',
      url: 'https://nodejs.org/en',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397837/bp-portfolio/tech/node-js/logo.png',
      sortOrder: 3,
      featured: true,
    },
    {
      name: 'Express.js',
      category: 'backend',
      notes:
        'Express is a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.',
      url: 'https://expressjs.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397956/bp-portfolio/tech/express-js/logo.png',
      sortOrder: 4,
      featured: true,
    },
    {
      name: 'React',
      category: 'frontend',
      notes: 'Component-based UI library for modern frontend apps.',
      url: 'https://react.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397833/bp-portfolio/tech/react/logo.png',
      sortOrder: 5,
      featured: true,
    },
    {
      name: 'React Native',
      category: 'framework',
      notes: 'React-based framework for building native iOS and Android apps.',
      url: 'https://reactnative.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1773601796/bp-portfolio/tech/react-native/logo.svg',
      sortOrder: 6,
      featured: true,
    },
    {
      name: 'Redux',
      category: 'frontend',
      notes:
        'Redux is a JS library for predictable and maintainable global state management.',
      url: 'https://redux.js.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397941/bp-portfolio/tech/redux/logo.png',
      sortOrder: 6,
      featured: true,
    },
    {
      name: 'Next.js',
      category: 'framework',
      notes: 'React framework for full-stack web applications.',
      url: 'https://nextjs.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397822/bp-portfolio/tech/next-js/logo.svg',
      sortOrder: 7,
      featured: true,
    },
    {
      name: 'Expo',
      category: 'framework',
      notes:
        'Platform and toolchain for building and shipping React Native apps faster.',
      url: 'https://expo.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1773601795/bp-portfolio/tech/expo/logo.png',
      sortOrder: 8,
      featured: true,
    },
    {
      name: 'Vite',
      category: 'tooling',
      notes:
        'Vite is a build tool that aims to provide a faster and leaner development experience for modern web projects.',
      url: 'https://vitejs.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397950/bp-portfolio/tech/vite/logo.jpg',
      sortOrder: 8,
      featured: true,
    },
    {
      name: 'Remix',
      category: 'framework',
      notes:
        'Remix is a full stack web framework focused on web standards to deliver a fast, resilient user experience.',
      url: 'https://remix.run/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397945/bp-portfolio/tech/remix/logo.png',
      sortOrder: 9,
      featured: true,
    },
    {
      name: 'The Epic Stack',
      category: 'tooling',
      notes:
        'An opinionated project starter and reference that allows teams to ship ideas faster on a stable foundation.',
      url: 'https://www.epicweb.dev/epic-stack',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397939/bp-portfolio/tech/the-epic-stack/logo.png',
      sortOrder: 10,
      featured: true,
    },
    {
      name: 'Vue.js',
      category: 'frontend',
      notes: 'Progressive JavaScript framework for declarative UIs.',
      url: 'https://vuejs.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397820/bp-portfolio/tech/vue-js/logo.png',
      sortOrder: 11,
      featured: true,
    },
    {
      name: 'Pinia',
      category: 'frontend',
      notes:
        'The intuitive store for Vue.js. Type safe, extensible, and modular by design.',
      url: 'https://pinia.vuejs.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397953/bp-portfolio/tech/pinia/logo.svg',
      sortOrder: 12,
      featured: true,
    },
    {
      name: 'Nuxt',
      category: 'framework',
      notes:
        'The intuitive Vue framework for building production-grade full-stack web apps and websites.',
      url: 'https://nuxt.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397915/bp-portfolio/tech/nuxt/logo.png',
      sortOrder: 13,
      featured: true,
    },
    {
      name: 'NPM',
      category: 'tooling',
      notes:
        "npm is the world's largest software registry for sharing and managing JavaScript packages.",
      url: 'https://www.npmjs.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397918/bp-portfolio/tech/npm/logo.png',
      sortOrder: 15,
      featured: true,
    },
    {
      name: 'Yarn',
      category: 'tooling',
      notes:
        'Yarn is a package manager and project manager for one-shot projects and large monorepos.',
      url: 'https://yarnpkg.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397948/bp-portfolio/tech/yarn/logo.png',
      sortOrder: 16,
      featured: true,
    },
    {
      name: 'GraphQL',
      category: 'data',
      notes:
        'GraphQL is a query language for APIs and a runtime for fulfilling those queries with existing data.',
      url: 'https://graphql.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397989/bp-portfolio/tech/graphql/logo.svg',
      sortOrder: 17,
      featured: true,
    },
    {
      name: 'TanStack',
      category: 'frontend',
      notes:
        'High-quality open-source software for web developers: routing, state, data fetching, tables, and more.',
      url: 'https://tanstack.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772398017/bp-portfolio/tech/tanstack/logo.png',
      sortOrder: 18,
      featured: true,
    },
    {
      name: 'React Router',
      category: 'frontend',
      notes:
        'React Router enables client-side routing so apps can update URLs and UI without full document requests.',
      url: 'https://reactrouter.com/en/main',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397974/bp-portfolio/tech/react-router/logo.png',
      sortOrder: 19,
      featured: true,
    },
    {
      name: 'Tailwind CSS',
      category: 'frontend',
      notes: 'Utility-first CSS framework for rapid UI styling.',
      url: 'https://tailwindcss.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397832/bp-portfolio/tech/tailwind-css/logo.png',
      sortOrder: 20,
      featured: true,
    },
    {
      name: 'Tailwind UI',
      category: 'frontend',
      notes:
        'Beautifully designed, expertly crafted components and templates built by the makers of Tailwind CSS.',
      url: 'https://tailwindui.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397913/bp-portfolio/tech/tailwind-ui/logo.png',
      sortOrder: 21,
      featured: true,
    },
    {
      name: 'Headless UI',
      category: 'frontend',
      notes:
        'Completely unstyled, fully accessible UI components designed to integrate beautifully with Tailwind CSS.',
      url: 'https://headlessui.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397986/bp-portfolio/tech/headless-ui/logo.png',
      sortOrder: 22,
      featured: true,
    },
    {
      name: 'Radix UI',
      category: 'frontend',
      notes:
        'Components, icons, colors, and templates for building high-quality, accessible UI. Free and open-source.',
      url: 'https://www.radix-ui.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397907/bp-portfolio/tech/radix-ui/logo.png',
      sortOrder: 23,
      featured: true,
    },
    {
      name: 'shadcn/ui',
      category: 'frontend',
      notes:
        'Beautifully designed components you can copy and paste into your apps to build your own component library.',
      url: 'https://ui.shadcn.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397903/bp-portfolio/tech/shadcn-ui/logo.png',
      sortOrder: 24,
      featured: true,
    },
    {
      name: 'Jest',
      category: 'testing',
      notes:
        'Jest is a JavaScript testing framework focused on simplicity and broad ecosystem support.',
      url: 'https://jestjs.io/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397917/bp-portfolio/tech/jest/logo.png',
      sortOrder: 25,
      featured: true,
    },
    {
      name: 'Playwright',
      category: 'testing',
      notes:
        'Playwright supports end-to-end testing across Chromium, WebKit, and Firefox on desktop and CI with mobile emulation.',
      url: 'https://playwright.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397921/bp-portfolio/tech/playwright/logo.svg',
      sortOrder: 26,
      featured: true,
    },
    {
      name: 'Testing Library',
      category: 'testing',
      notes:
        'Simple and complete testing utilities that encourage good testing practices.',
      url: 'https://testing-library.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397899/bp-portfolio/tech/testing-library/logo.png',
      sortOrder: 27,
      featured: true,
    },
    {
      name: 'Vitest',
      category: 'testing',
      notes:
        'Next-generation Vite-native testing framework focused on speed and modern DX.',
      url: 'https://vitest.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397943/bp-portfolio/tech/vitest/logo.jpg',
      sortOrder: 28,
      featured: true,
    },
    {
      name: 'Clerk',
      category: 'backend',
      notes:
        'Comprehensive user management platform with embeddable UIs, APIs, and admin dashboards for auth and user management.',
      url: 'https://clerk.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397906/bp-portfolio/tech/clerk/logo.png',
      sortOrder: 29,
      featured: true,
    },
    {
      name: 'Supabase',
      category: 'data',
      notes:
        'Open-source Firebase alternative with Postgres, auth, APIs, edge functions, realtime, and storage.',
      url: 'https://supabase.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397971/bp-portfolio/tech/supabase/logo.png',
      sortOrder: 32,
      featured: true,
    },
    {
      name: 'Resend',
      category: 'backend',
      notes:
        'Developer-focused email platform for transactional and marketing email delivery.',
      url: 'https://resend.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397958/bp-portfolio/tech/resend/logo.jpg',
      sortOrder: 33,
      featured: true,
    },
    {
      name: 'Zod',
      category: 'tooling',
      notes:
        'TypeScript-first schema declaration and validation library for robust data contracts.',
      url: 'https://zod.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397897/bp-portfolio/tech/zod/logo.png',
      sortOrder: 34,
      featured: true,
    },
    {
      name: 'Digital Ocean',
      category: 'tooling',
      notes: 'Cloud platform to deploy, manage, and scale applications.',
      url: 'https://www.digitalocean.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397964/bp-portfolio/tech/digital-ocean/logo.png',
      sortOrder: 35,
      featured: true,
    },
    {
      name: 'Fly.io',
      category: 'tooling',
      notes:
        'Scalable full-stack hosting with global Anycast load-balancing and zero-config private networking.',
      url: 'https://fly.io/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397909/bp-portfolio/tech/fly-io/logo.png',
      sortOrder: 36,
      featured: true,
    },
    {
      name: 'Netlify',
      category: 'tooling',
      notes:
        'Global production-ready platform for web deployment without server setup overhead.',
      url: 'https://www.netlify.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397960/bp-portfolio/tech/netlify/logo.png',
      sortOrder: 37,
      featured: true,
    },
    {
      name: 'Vercel',
      category: 'tooling',
      notes:
        'Frontend cloud platform for fast iteration, previews, and zero-configuration framework support.',
      url: 'https://vercel.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397977/bp-portfolio/tech/vercel/logo.png',
      sortOrder: 38,
      featured: true,
    },
    {
      name: 'AI SDK',
      category: 'ai',
      notes:
        'Type-safe TypeScript SDK for building AI-powered apps with model/provider abstractions.',
      url: 'https://ai-sdk.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772414375/bp-portfolio/tech/ai-sdk/logo.png',
      sortOrder: 50,
      featured: false,
    },
    {
      name: 'GSAP',
      category: 'frontend',
      notes:
        'High-performance animation platform for production UI motion and storytelling.',
      url: 'https://gsap.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772411503/bp-portfolio/tech/gsap/logo.png',
      sortOrder: 51,
      featured: false,
    },
    {
      name: 'Heroicons',
      category: 'frontend',
      notes: 'Official Tailwind Labs SVG icon set for modern UI systems.',
      url: 'https://heroicons.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772411513/bp-portfolio/tech/heroicons/logo.png',
      sortOrder: 52,
      featured: false,
    },
    {
      name: 'Lucide React',
      category: 'frontend',
      notes:
        'Open-source icon library with first-class React components and tree-shaking.',
      url: 'https://lucide.dev/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772411501/bp-portfolio/tech/lucide-react/logo.png',
      sortOrder: 53,
      featured: false,
    },
    {
      name: 'MongoDB',
      category: 'data',
      notes: 'Document database for flexible schema and scale.',
      url: 'https://www.mongodb.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397835/bp-portfolio/tech/mongodb/logo.jpg',
      sortOrder: 54,
      featured: false,
    },
    {
      name: 'MSW',
      category: 'testing',
      notes: 'Network-level API mocking for test and dev environments.',
      url: 'https://mswjs.io/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772417323/bp-portfolio/tech/msw/logo.png',
      sortOrder: 55,
      featured: false,
    },
    {
      name: 'OpenAI',
      category: 'ai',
      notes: 'Model APIs for reasoning, generation, and multimodal workflows.',
      url: 'https://platform.openai.com/docs/overview',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772397829/bp-portfolio/tech/openai/logo.png',
      sortOrder: 56,
      featured: false,
    },
    {
      name: 'PostgreSQL',
      category: 'data',
      notes: 'Production-grade relational database for app data.',
      url: 'https://www.postgresql.org/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772417313/bp-portfolio/tech/postgresql/logo.png',
      sortOrder: 57,
      featured: false,
    },
    {
      name: 'Prisma',
      category: 'data',
      notes: 'Type-safe database toolkit and ORM for Node.js.',
      url: 'https://www.prisma.io/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772417309/bp-portfolio/tech/prisma/logo.png',
      sortOrder: 58,
      featured: false,
    },
    {
      name: 'React Markdown',
      category: 'frontend',
      notes:
        'Markdown-to-React renderer for content-rich interfaces and documentation views.',
      url: 'https://github.com/remarkjs/react-markdown',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772411505/bp-portfolio/tech/react-markdown/logo.png',
      sortOrder: 59,
      featured: false,
    },
    {
      name: 'SendGrid',
      category: 'tooling',
      notes:
        'Transactional email platform and API for production-grade delivery workflows.',
      url: 'https://sendgrid.com/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772411515/bp-portfolio/tech/sendgrid/logo.png',
      sortOrder: 60,
      featured: false,
    },
    {
      name: 'SQLite',
      category: 'data',
      notes:
        'Embedded relational database engine for local-first apps, testing, and lightweight persistence.',
      url: 'https://www.sqlite.org/',
      logoUrl: 'https://www.sqlite.org/images/sqlite370_banner.svg',
      sortOrder: 61,
      featured: false,
    },
    {
      name: 'Zustand',
      category: 'frontend',
      notes:
        'Minimal state management library for React with simple store-based patterns.',
      url: 'https://zustand.docs.pmnd.rs/',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1772417320/bp-portfolio/tech/zustand/logo.png',
      sortOrder: 62,
      featured: false,
    },
  ],
  uses: [
    {
      title: '14-inch MacBook Pro, Apple M2 Pro, 16GB RAM (2023)',
      category: 'workstation',
      description:
        'Strong performance for daily development, project management, and content work.',
      sortOrder: 1,
    },
    {
      title: 'Dual 27-inch LG UltraFine UHD 4K HDR monitors',
      category: 'workstation',
      description:
        'When attention to detail pays the bills, multiple 4K screens are always preferred.',
      sortOrder: 2,
    },
    {
      title: 'Apple Magic Keyboard',
      category: 'workstation',
      description: 'A dependable, low-friction setup I’ve used for years.',
      sortOrder: 3,
    },
    {
      title: 'Apple Magic Trackpad',
      category: 'workstation',
      description:
        'Gesture support keeps navigation and context-switching fast.',
      sortOrder: 4,
    },
    {
      title: 'FAMISKY electric standing desk',
      category: 'workstation',
      description:
        'I have been coding standing up for nearly a decade. It helps me maintain energy over long sessions.',
      sortOrder: 5,
    },
    {
      title: 'Audio Pro USB-C microphone',
      category: 'workstation',
      description:
        'Clean audio quality improves remote collaboration and pair programming.',
      sortOrder: 6,
    },
    {
      title: 'Visual Studio Code',
      category: 'development',
      description:
        'The extension ecosystem and speed make VS Code my daily driver for most engineering work.',
      sortOrder: 7,
    },
    {
      title: 'GitKraken',
      category: 'development',
      description:
        'Helpful when I need high-level context across many repositories and branching workflows.',
      sortOrder: 8,
    },
    {
      title: 'Insomnia',
      category: 'development',
      description:
        'Great for managing and testing large sets of REST and GraphQL requests across environments.',
      sortOrder: 9,
    },
    {
      title: 'Figma',
      category: 'design',
      description:
        'Started as a design tool and became a collaborative workspace for planning and iteration.',
      sortOrder: 10,
    },
    {
      title: 'Whimsical',
      category: 'design',
      description:
        'Fast way to turn rough ideas into diagrams that teams can discuss and improve quickly.',
      sortOrder: 11,
    },
    {
      title: 'Pixelmator Pro',
      category: 'design',
      description:
        'My default for lightweight graphic work when I need to move quickly.',
      sortOrder: 12,
    },
    {
      title: 'Syntax.fm',
      category: 'podcasts',
      description:
        'Practical web development conversations covering modern tooling and frameworks.',
      sortOrder: 13,
    },
    {
      title: 'The Changelog',
      category: 'podcasts',
      description:
        'Deep interviews and weekly updates across software engineering, open source, and leadership.',
      sortOrder: 14,
    },
    {
      title: 'Nav.al',
      category: 'podcasts',
      description:
        'Technology and business entrepreneurship perspectives that consistently challenge assumptions.',
      sortOrder: 15,
    },
    {
      title: 'The Tim Ferriss Show',
      category: 'podcasts',
      description:
        'Long-form conversations that surface useful mental models, habits, and systems.',
      sortOrder: 16,
    },
  ],
  projects: [
    {
      title: "Brandon Perfetti's Portfolio",
      slug: 'bp-portfolio',
      description: 'Source code for my personal site and content platform.',
      link: 'https://github.com/brandonperfetti/bp-portfolio',
      linkLabel: 'github.com/brandonperfetti/bp-portfolio',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713915478/bp-portfolio/images/Head_Shot_vvk5yr.png',
      featured: true,
      sortOrder: 1,
    },
    {
      title: 'Top Timelines',
      slug: 'top-timelines',
      description: 'Event timelines made simple for teams and organizations.',
      link: 'https://toptimelines.com/',
      linkLabel: 'toptimelines.com',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1710096798/top-timelines/top_timelines_logo_nzgxaq.svg',
      featured: true,
      sortOrder: 2,
    },
    {
      title: 'macOS Portfolio',
      slug: 'macos-portfolio',
      description:
        'Interactive macOS-inspired portfolio experience built with React, TypeScript, GSAP, Zustand, and Tailwind CSS.',
      link: 'https://macos.brandonperfetti.com/',
      linkLabel: 'macos.brandonperfetti.com',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1773622944/portfolio/projects/macos-portfolio/macbook-logo.png',
      featured: true,
      sortOrder: 3,
    },
    {
      title: 'Sans Faux Studios',
      slug: 'sans-faux-studios',
      description: 'A web studio focused on modern product websites and apps.',
      link: 'https://sansfaux.com/',
      linkLabel: 'sansfaux.com',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713742159/bp-portfolio/images/logos/favicon_m2unhm.png',
      featured: true,
      sortOrder: 4,
    },
    {
      title: 'Dev Flow',
      slug: 'dev-flow',
      description: 'A Stack Overflow style question-and-answer platform.',
      link: 'https://devflow-coral2.vercel.app/',
      linkLabel: 'devflow-coral2.vercel.app',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1722822416/DevFlow/site-logo_wicnp6.svg',
      featured: true,
      sortOrder: 5,
    },
    {
      title: 'Filmpire',
      slug: 'filmpire',
      description: 'A media experience for exploring and tracking movies.',
      link: 'https://filmpire-beta.vercel.app/',
      linkLabel: 'filmpire-beta.vercel.app',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1724377796/Filmpire/site-logo_io51hi.svg',
      featured: true,
      sortOrder: 6,
    },
    {
      title: 'EMP Consultants',
      slug: 'emp-consultants',
      description: 'A modernized web presence for a forensic engineering firm.',
      link: 'https://empconsultants.com/',
      linkLabel: 'empconsultants.com',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713727772/emp/favicon_jqaems.png',
      featured: true,
      sortOrder: 7,
    },
  ],
  pages: [
    {
      slug: 'home',
      title:
        'Senior frontend and full-stack engineer focused on practical software delivery.',
      subtitle:
        "I'm Brandon Perfetti from Orange County, CA. I build reliable web platforms with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows, with product-minded delivery leadership.",
      seoTitle: 'Brandon Perfetti — Senior Frontend & Full-Stack Engineer',
      seoDescription:
        'Senior frontend-focused full-stack engineer delivering practical software systems with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows.',
      heroImageUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142617/bp-spotlight/images/avatar_jeycju.jpg',
      homeImageUrls: [
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg',
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-2_vutl5o.jpg',
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298667/image-3_rfkaku.jpg',
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298665/image-4_iten8l.jpg',
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298668/image-5_cpx20p.jpg',
      ],
    },
    {
      slug: 'about',
      title:
        'I build practical, high-impact software with frontend excellence and full-stack systems thinking.',
      subtitle:
        'Brandon Perfetti is a senior frontend and full-stack engineer from Orange County, CA, with product-minded delivery leadership across SaaS platforms.',
      seoTitle:
        'About Brandon Perfetti — Senior Frontend & Full-Stack Engineer',
      seoDescription:
        'Senior frontend-focused full-stack engineer building scalable SaaS systems with Next.js, TypeScript, GraphQL, and AI-enabled workflows.',
      heroImageUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142618/bp-spotlight/images/portrait_zdvgpf.jpg',
      homeImageUrls: [],
    },
    {
      slug: 'articles',
      title:
        'Writing on mindset, software design, leadership, and product execution.',
      subtitle:
        'AI-assisted, expert-guided notes on real engineering work. I use these articles to think clearly, improve execution, and share practical lessons as I learn.',
      seoTitle: 'Articles | AI-Assisted Engineering Notes',
      seoDescription:
        'Practical articles on mindset, software design, leadership, and product execution. AI-assisted and guided by real engineering judgment and continuous learning.',
      heroImageUrl: null,
      homeImageUrls: [],
    },
    {
      slug: 'projects',
      title:
        'Selected engineering projects across frontend architecture, full-stack delivery, and AI-enabled workflows.',
      subtitle:
        'A practical mix of SaaS platform builds, integration-heavy implementations, and product-minded execution.',
      seoTitle: 'Projects — Brandon Perfetti | Frontend & Full-Stack Engineer',
      seoDescription:
        "Explore Brandon Perfetti's projects spanning Next.js, TypeScript, GraphQL, integrations, and AI-enabled engineering workflows.",
      heroImageUrl: null,
      homeImageUrls: [],
    },
    {
      slug: 'tech',
      title:
        'Core technologies I use to build scalable web and AI-enabled systems.',
      subtitle:
        'A practical stack for frontend architecture, full-stack delivery, and reliable execution over time.',
      seoTitle:
        'Tech Stack — Brandon Perfetti | Frontend & Full-Stack Engineer',
      seoDescription:
        "Explore Brandon Perfetti's core stack: Next.js, TypeScript, React, GraphQL, integrations, and AI-enabled engineering workflows.",
      heroImageUrl: null,
      homeImageUrls: [],
    },
    {
      slug: 'uses',
      title:
        'Software, hardware, and workflows I use to ship reliable products.',
      subtitle:
        'A practical stack for engineering execution, AI-assisted workflows, communication, and continuous learning.',
      seoTitle: 'Uses — Brandon Perfetti | Tools, Stack, and Workflow',
      seoDescription:
        'Explore the software, hardware, and workflows Brandon Perfetti uses for engineering execution, AI-assisted work, and continuous learning.',
      heroImageUrl: null,
      homeImageUrls: [],
    },
    {
      slug: 'corvus',
      title: 'Corvus AI Assistant',
      subtitle:
        'A practical AI workspace for Q&A, prompt iteration, and image generation experiments tied to real engineering workflows.',
      seoTitle: 'Corvus AI Assistant — Brandon Perfetti',
      seoDescription:
        "Explore Corvus, Brandon Perfetti's AI assistant workspace for practical Q&A, prompt iteration, and image generation workflows.",
      heroImageUrl: null,
      homeImageUrls: [],
    },
  ],
  siteSettings: {
    siteName: 'Brandon Perfetti',
    canonicalUrl: 'https://brandonperfetti.com',
    seoDescription:
      'Senior frontend-focused full-stack engineer delivering practical software systems with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows.',
    ogImageUrl:
      'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142617/bp-spotlight/images/avatar_jeycju.jpg',
  },
  workHistory: [
    {
      company: 'Brytecore',
      title: 'Senior Frontend Engineer',
      description: '',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1774040299/bp-portfolio/logos/footer-brytecore-bug_xsf8iw.webp',
      startDate: '2024-01-01T12:00:00.000Z',
      endDate: null,
      current: true,
      sortOrder: 5,
    },
    {
      company: 'Lone Wolf Technologies',
      title: 'Technical PM + Software Engineer',
      description:
        'Led and delivered technical project and product initiatives in cross-functional environments.',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562788/bp-portfolio/images/logos/lone-wolf_hpftff_fsqe3o.png',
      startDate: '2021-01-01T12:00:00.000Z',
      endDate: '2023-01-01T12:00:00.000Z',
      current: false,
      sortOrder: 20,
    },
    {
      company: 'W+R Studios',
      title: 'Technical PM + Senior Data Integrations Engineer',
      description:
        'Drove enterprise data integration programs and technical delivery leadership.',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      startDate: '2017-01-01T12:00:00.000Z',
      endDate: '2020-01-01T12:00:00.000Z',
      current: false,
      sortOrder: 30,
    },
    {
      company: 'W+R Studios',
      title: 'Technical PM + Data Integrations Engineer',
      description:
        'Built and maintained integration pipelines and implementation workflows for client platforms.',
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684011516/wr-studios_ibqcpy.svg',
      startDate: '2013-01-01T12:00:00.000Z',
      endDate: '2017-01-01T12:00:00.000Z',
      current: false,
      sortOrder: 40,
    },
  ],
} as {
  tech: Array<{
    name: string
    category: string
    notes: string
    url: string
    logoUrl: string | null
    sortOrder: number
    featured: boolean
  }>
  uses: Array<{
    title: string
    category: string
    description: string
    sortOrder: number
  }>
  projects: Array<{
    title: string
    slug: string
    description: string
    link: string
    linkLabel: string
    logoUrl: string | null
    featured: boolean
    sortOrder: number
  }>
  pages: Array<{
    slug: string
    title: string
    subtitle: string
    seoTitle: string
    seoDescription: string
    heroImageUrl: string | null
    homeImageUrls: string[]
  }>
  siteSettings: {
    siteName: string
    canonicalUrl: string
    seoDescription: string
    ogImageUrl: string | null
  }
  workHistory: Array<{
    company: string
    title: string
    description: string
    logoUrl: string | null
    startDate: string
    endDate: string | null
    current: boolean
    sortOrder: number
  }>
}

const run = async () => {
  const payload = await getPayload({ config })
  const mediaCache = new Map<string, number | null>()

  const uploadLogo = async (
    url: string | null,
    alt: string,
  ): Promise<number | null> => {
    if (!url) return null
    if (mediaCache.has(url)) return mediaCache.get(url)!
    try {
      const parsed = new URL(url)
      const stem = path
        .basename(parsed.pathname, path.extname(parsed.pathname))
        .slice(0, 48)
      // Basenames collide across folders (every tech logo is
      // .../tech/<name>/logo.svg), so the reuse key must be URL-unique:
      // parent path segment + basename + short URL hash.
      const segments = parsed.pathname.split('/').filter(Boolean)
      const parent =
        [...segments]
          .slice(0, -1)
          .reverse()
          .find((s) => !/^v\d+$/.test(s) && s !== 'upload') || ''
      const hash = createHash('sha1').update(url).digest('hex').slice(0, 8)
      const base = [parent, stem, hash]
        .filter(Boolean)
        .join('-')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 80)
      // Reuse an already-seeded media doc (idempotent re-runs).
      const existing = await payload.find({
        collection: 'media',
        limit: 1,
        where: { filename: { contains: `seeded-${base}` } },
      })
      if (existing.docs[0]) {
        mediaCache.set(url, existing.docs[0].id as number)
        return existing.docs[0].id as number
      }
      // Legacy key (pre-fix runs): basename only, disambiguated by exact
      // alt so correctly-seeded docs are reused instead of re-uploaded.
      // (The colliding shared doc only matches its true owner's alt.)
      const legacy = await payload.find({
        collection: 'media',
        limit: 1,
        where: {
          and: [
            { filename: { contains: `seeded-${stem}` } },
            { alt: { equals: alt } },
          ],
        },
      })
      if (legacy.docs[0]) {
        mediaCache.set(url, legacy.docs[0].id as number)
        return legacy.docs[0].id as number
      }
      if (DRY_RUN) {
        payload.logger.info(`[seed] DRY_RUN would upload ${url.slice(0, 90)}`)
        mediaCache.set(url, null)
        return null
      }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mimetype = res.headers.get('content-type') || 'image/png'
      const ext = mimetype.includes('svg')
        ? 'svg'
        : mimetype.includes('webp')
          ? 'webp'
          : mimetype.includes('jpeg') || mimetype.includes('jpg')
            ? 'jpg'
            : 'png'
      const doc = await payload.create({
        collection: 'media',
        data: { alt },
        file: {
          data: buffer,
          mimetype,
          name: `seeded-${base}.${ext}`,
          size: buffer.length,
        },
      })
      mediaCache.set(url, doc.id as number)
      return doc.id as number
    } catch (err) {
      payload.logger.warn(
        `[seed] logo failed ${url.slice(0, 90)}: ${String(err)}`,
      )
      mediaCache.set(url, null)
      return null
    }
  }

  const report = { created: 0, updated: 0, skipped: 0 }

  const upsert = async (
    collection: 'tech-stack' | 'uses' | 'projects' | 'work-history',
    where: Where,
    data: Record<string, unknown>,
    label: string,
  ) => {
    const found = await payload.find({ collection, where, limit: 1 })
    if (DRY_RUN) {
      payload.logger.info(
        `[seed] DRY_RUN ${found.docs[0] ? 'update' : 'create'} ${collection}: ${label}`,
      )
      report.skipped += 1
      return
    }
    if (found.docs[0]) {
      await payload.update({ collection, id: found.docs[0].id, data })
      report.updated += 1
    } else {
      await payload.create({ collection, data: data as never })
      report.created += 1
    }
  }

  payload.logger.info(`[seed] start (DRY_RUN=${DRY_RUN})`)

  for (const t of SEED.tech) {
    const logo = await uploadLogo(t.logoUrl, `${t.name} logo`)
    await upsert(
      'tech-stack',
      { name: { equals: t.name } },
      {
        name: t.name,
        category: t.category,
        notes: t.notes,
        url: t.url,
        featured: t.featured,
        sortOrder: t.sortOrder,
        ...(logo ? { logo } : {}),
      },
      t.name,
    )
  }

  for (const u of SEED.uses) {
    await upsert(
      'uses',
      { title: { equals: u.title } },
      {
        title: u.title,
        category: u.category,
        description: u.description,
        sortOrder: u.sortOrder,
      },
      u.title,
    )
  }

  for (const p of SEED.projects) {
    const logo = await uploadLogo(p.logoUrl, `${p.title} logo`)
    await upsert(
      'projects',
      { slug: { equals: p.slug } },
      {
        title: p.title,
        slug: p.slug,
        slugLock: true,
        description: p.description,
        link: p.link,
        linkLabel: p.linkLabel,
        featured: p.featured,
        sortOrder: p.sortOrder,
        ...(logo ? { logo } : {}),
      },
      p.title,
    )
  }

  for (const w of SEED.workHistory) {
    const logo = await uploadLogo(w.logoUrl, `${w.company} logo`)
    await upsert(
      'work-history',
      {
        and: [
          { company: { equals: w.company } },
          { title: { equals: w.title } },
        ],
      },
      {
        company: w.company,
        title: w.title,
        description: w.description || undefined,
        startDate: w.startDate,
        endDate: w.endDate || undefined,
        current: w.current,
        sortOrder: w.sortOrder,
        ...(logo ? { logo } : {}),
      },
      `${w.company} — ${w.title}`,
    )
  }

  for (const pg of SEED.pages) {
    const hero = await uploadLogo(pg.heroImageUrl, `${pg.slug} hero image`)
    const stripImages: number[] = []
    for (const url of pg.homeImageUrls) {
      // Alt kept from the original seed so the legacy media lookup
      // (filename + exact alt) reuses the already-uploaded photos.
      const id = await uploadLogo(url, 'Home gallery photo')
      if (id) stripImages.push(id)
    }
    const found = await payload.find({
      collection: 'pages',
      where: { slug: { equals: pg.slug } },
      limit: 1,
      draft: true,
    })
    const data = {
      title: pg.title,
      subtitle: pg.subtitle,
      slug: pg.slug,
      slugLock: true,
      _status: 'published' as const,
      hero: {
        type: 'none' as const,
        ...(hero ? { media: hero } : {}),
      },
      meta: { title: pg.seoTitle, description: pg.seoDescription },
      // Pages requires at least one layout block; route components render
      // their own bodies today, so seeded pages carry a minimal spacer.
      // Home instead gets a PhotoStrip block — the home route consumes it
      // for the hero-slot gallery (see src/app/(frontend)/page.tsx).
      layout: stripImages.length
        ? [{ blockType: 'photoStrip' as const, images: stripImages }]
        : [{ blockType: 'spacer' as const, size: 'sm' as const }],
    }
    if (DRY_RUN) {
      payload.logger.info(
        `[seed] DRY_RUN ${found.docs[0] ? 'update' : 'create'} pages: ${pg.slug}`,
      )
      report.skipped += 1
    } else if (found.docs[0]) {
      await payload.update({
        collection: 'pages',
        id: found.docs[0].id,
        data,
        context: { disableRevalidate: true },
      })
      report.updated += 1
    } else {
      await payload.create({
        collection: 'pages',
        data,
        draft: false,
        context: { disableRevalidate: true },
      })
      report.created += 1
    }
  }

  // SiteSettings global (single source for name/canonical/default SEO).
  const og = await uploadLogo(SEED.siteSettings.ogImageUrl, 'Default OG image')
  if (DRY_RUN) {
    payload.logger.info('[seed] DRY_RUN update global site-settings')
  } else {
    await payload.updateGlobal({
      slug: 'site-settings',
      context: { disableRevalidate: true },
      data: {
        siteName: SEED.siteSettings.siteName,
        canonicalUrl: SEED.siteSettings.canonicalUrl,
        defaultSeo: {
          title: SEED.siteSettings.siteName,
          description: SEED.siteSettings.seoDescription,
          ...(og ? { ogImage: og } : {}),
        },
      },
    })
    payload.logger.info('[seed] global site-settings updated')
  }

  payload.logger.info(
    `[seed] done: created=${report.created} updated=${report.updated} dryRunPlanned=${report.skipped}`,
  )
}

// payload run kills floating promises after module evaluation — top-level
// await is required (same lesson as the article migration).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error('[seed] fatal:', err)
  process.exit(1)
}

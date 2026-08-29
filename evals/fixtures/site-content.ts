/**
 * Site-content fixtures for the Corvus evals (#82).
 *
 * SOURCE: https://brandonperfetti.com — the PUBLIC, anonymous surface only.
 * CAPTURED: 2026-08-28. Endpoints, all served without authentication:
 *   - https://brandonperfetti.com/api/work-history?limit=200&depth=0
 *   - https://brandonperfetti.com/api/projects?limit=200&depth=0
 *   - https://brandonperfetti.com/api/tech-stack?limit=200&depth=0
 *   - https://brandonperfetti.com/api/uses?limit=200&depth=0
 *   - https://brandonperfetti.com/api/posts?limit=5&sort=-publishedAt&depth=0
 * Corroborated against https://brandonperfetti.com/sitemap.xml (article slugs),
 * https://brandonperfetti.com/api/search (article titles + publish dates) and the
 * server-rendered homepage (work history). Full capture record, including the
 * transport caveat, lives in the batch evidence.
 *
 * @remarks These are **documents**, not chunks, and that is the point. The
 * eval retriever runs them through the REAL `chunkDocument`, so the fixture
 * corpus is byte-for-byte what the production pipeline would index for the
 * same records — a fixture written as pre-chunked text could drift from the
 * chunker without anything noticing.
 *
 * Three limits are deliberate and worth knowing before adding to this file:
 *
 * 1. **Metadata only, no article bodies.** The post fixtures carry no
 *    `content`, so `chunkPost` produces its documented one-chunk
 *    `"<title> — <excerpt>"` form. Titles, slugs, publish dates and the CMS
 *    `excerpt` field are all the site already renders on `/articles`; bodies
 *    would bloat the fixture and add nothing the seeded questions ask about.
 * 2. **Public by construction.** Every value here is returned by an anonymous
 *    request to the public REST API. This repo is public; nothing that is not
 *    already published may be added.
 * 3. **`id` provenance is mixed.** Post ids are the real published ids the API
 *    returned. The four flat collections' ids are FIXTURE-LOCAL — the
 *    projection used did not expose them — and are only ever used as a chunk
 *    key, never asserted as a site fact.
 *
 * This is a snapshot of live content and will drift as the site changes.
 * `docs/AI.md` carries the staleness note (Batch 6).
 */
import type { CorvusCollectionSlug } from '../../src/lib/ai/chunking'

/** ISO date this fixture corpus was captured from the live site. */
export const FIXTURE_CAPTURED_AT = '2026-08-28'

/** One captured document, in the shape the chunkers accept. */
export interface SiteFixtureDoc {
  collection: CorvusCollectionSlug
  doc: Record<string, unknown>
}

/**
 * Work-history records — `/api/work-history`, corroborated by the homepage.
 *
 * @remarks The homepage renders the same four rows with the same companies,
 * titles and start years, which is why work history is the block the evals
 * lean on hardest for `expected` values.
 */
const WORK_HISTORY: SiteFixtureDoc[] = [
  {
    collection: 'work-history',
    doc: {
      id: 1,
      company: 'Brytecore',
      title: 'Senior Frontend Engineer',
      startDate: '2024-09-02T12:00:00.000Z',
      endDate: null,
      current: true,
    },
  },
  {
    collection: 'work-history',
    doc: {
      id: 2,
      company: 'Freelance',
      title: 'Software Engineer',
      startDate: '2023-07-01T12:00:00.000Z',
      endDate: '2024-09-01T12:00:00.000Z',
      current: false,
    },
  },
  {
    collection: 'work-history',
    doc: {
      id: 3,
      company: 'Lone Wolf Technologies',
      title: 'Software Engineer · Technical PM',
      startDate: '2020-12-01T12:00:00.000Z',
      endDate: '2023-07-31T12:00:00.000Z',
      current: false,
    },
  },
  {
    collection: 'work-history',
    doc: {
      id: 4,
      company: 'W+R Studios',
      title: 'Senior Data Integrations Engineer',
      startDate: '2012-07-01T12:00:00.000Z',
      endDate: '2020-12-31T12:00:00.000Z',
      current: false,
    },
  },
]

/** Project records — `/api/projects`, corroborated by `/projects`. */
const PROJECTS: SiteFixtureDoc[] = [
  {
    collection: 'projects',
    doc: {
      id: 11,
      title: "Brandon Perfetti's Portfolio",
      description: 'Source code for my personal site and content platform.',
      link: 'https://github.com/brandonperfetti/bp-portfolio',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 12,
      title: 'Top Timelines',
      description: 'Event timelines made simple for teams and organizations.',
      link: 'https://toptimelines.com/',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 13,
      title: 'macOS Portfolio',
      description:
        'Interactive macOS-inspired portfolio experience built with React, TypeScript, GSAP, Zustand, and Tailwind CSS.',
      link: 'https://macos.brandonperfetti.com/',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 14,
      title: 'Sans Faux Studios',
      description: 'A web studio focused on modern product websites and apps.',
      link: 'https://sansfaux.com/',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 15,
      title: 'Dev Flow',
      description: 'A Stack Overflow style question-and-answer platform.',
      link: 'https://devflow-coral2.vercel.app/',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 16,
      title: 'Filmpire',
      description: 'A media experience for exploring and tracking movies.',
      link: 'https://filmpire-beta.vercel.app/',
    },
  },
  {
    collection: 'projects',
    doc: {
      id: 17,
      title: 'EMP Consultants',
      description: 'A modernized web presence for a forensic engineering firm.',
      link: 'https://empconsultants.com/',
    },
  },
]

/**
 * Tech-stack records — `/api/tech-stack`.
 *
 * @remarks A 10-entry subset of the 50 the endpoint returns: every entry that
 * carries a `proficiency` label, because those are the only tech-stack facts
 * the evals assert. `/tech` itself renders client-side and returned no entries
 * to a server-side fetch, exactly as the batch handoff predicted — the REST
 * endpoint is the server-rendered substitute.
 */
const TECH_STACK: SiteFixtureDoc[] = [
  {
    collection: 'tech-stack',
    doc: {
      id: 21,
      name: 'TypeScript',
      category: 'frontend',
      proficiency: 'daily',
      url: 'https://www.typescriptlang.org/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 22,
      name: 'React',
      category: 'frontend',
      proficiency: 'daily',
      url: 'https://react.dev/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 23,
      name: 'Next.js',
      category: 'framework',
      proficiency: 'daily',
      url: 'https://nextjs.org/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 24,
      name: 'Tailwind CSS',
      category: 'frontend',
      proficiency: 'daily',
      url: 'https://tailwindcss.com/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 25,
      name: 'GraphQL',
      category: 'data',
      proficiency: 'daily',
      url: 'https://graphql.org/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 26,
      name: 'AI SDK',
      category: 'ai',
      proficiency: 'daily',
      url: 'https://ai-sdk.dev/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 27,
      name: 'Vitest',
      category: 'testing',
      proficiency: 'proficient',
      url: 'https://vitest.dev/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 28,
      name: 'PostgreSQL',
      category: 'data',
      proficiency: 'proficient',
      url: 'https://www.postgresql.org/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 29,
      name: 'Prisma',
      category: 'data',
      proficiency: 'proficient',
      url: 'https://www.prisma.io/',
    },
  },
  {
    collection: 'tech-stack',
    doc: {
      id: 30,
      name: 'SQLite',
      category: 'data',
      proficiency: 'proficient',
      url: 'https://www.sqlite.org/',
    },
  },
]

/** Uses records — `/api/uses`, corroborated by the server-rendered `/uses`. */
const USES: SiteFixtureDoc[] = [
  {
    collection: 'uses',
    doc: {
      id: 41,
      title: '14-inch MacBook Pro, Apple M2 Pro, 16GB RAM (2023)',
      category: 'workstation',
      description:
        'Strong performance for daily development, project management, and content work.',
    },
  },
  {
    collection: 'uses',
    doc: {
      id: 42,
      title: 'Dual 27-inch LG UltraFine UHD 4K HDR monitors',
      category: 'workstation',
      description:
        'When attention to detail pays the bills, multiple 4K screens are always preferred.',
    },
  },
  {
    collection: 'uses',
    doc: {
      id: 43,
      title: 'Apple Magic Keyboard',
      category: 'workstation',
      description: "A dependable, low-friction setup I've used for years.",
    },
  },
  {
    collection: 'uses',
    doc: {
      id: 44,
      title: 'Visual Studio Code',
      category: 'development',
      description:
        'The extension ecosystem and speed make VS Code my daily driver for most engineering work.',
    },
  },
  {
    collection: 'uses',
    doc: {
      id: 45,
      title: 'GitKraken',
      category: 'development',
      description:
        'Helpful when I need high-level context across many repositories and branching workflows.',
    },
  },
  {
    collection: 'uses',
    doc: {
      id: 46,
      title: 'Figma',
      category: 'design',
      description:
        'Started as a design tool and became a collaborative workspace for planning and iteration.',
    },
  },
]

/**
 * Post records — `/api/posts`, the five most recently published.
 *
 * @remarks `_status: 'published'` is what `isEmbeddable` gates on and is a
 * statement of fact about these documents: all five are live on
 * `/articles/<slug>` and appear in `sitemap.xml`. `access.visibility` is
 * `'public'` on every one because a probe of
 * `?where[access.visibility][equals]=gated` returned `totalDocs: 0` — there is
 * no gated post in production today, which is why the gating assertions live
 * in the pg-backed tier against clearly synthetic records instead.
 */
const POSTS: SiteFixtureDoc[] = [
  {
    collection: 'posts',
    doc: {
      id: 55,
      title: 'Your Runbook Is Rotting. Teach It to an Agent Instead.',
      slug: 'runbooks-to-agent-skills',
      publishedAt: '2026-08-18T12:00:00.000Z',
      _status: 'published',
      access: { visibility: 'public' },
      excerpt:
        'A real Next.js modernization produced a playbook — and instead of letting it rot in a wiki, I turned it into a tested AI agent skill.',
    },
  },
  {
    collection: 'posts',
    doc: {
      id: 54,
      title:
        'The Cheapest Database Migration Is the One You Do Before Production Exists',
      slug: 'from-neon-to-supabase',
      publishedAt: '2026-08-14T12:00:00.000Z',
      _status: 'published',
      access: { visibility: 'public' },
      excerpt:
        "I moved my portfolio's Postgres from Neon to Supabase in one evening — and the real reason it was easy is timing.",
    },
  },
  {
    collection: 'posts',
    doc: {
      id: 53,
      title: 'I Was Paying $20 a Month to Email Myself',
      slug: 'from-sendgrid-to-resend',
      publishedAt: '2026-08-11T12:00:00.000Z',
      _status: 'published',
      access: { visibility: 'public' },
      excerpt:
        'A $19.95/month plan whose only job was delivering my own contact form — until a paywall forced the audit.',
    },
  },
  {
    collection: 'posts',
    doc: {
      id: 52,
      title:
        "The Stack I'll Reuse: My 2026 Next.js Foundation, and the Rules That Keep It Current",
      slug: 'the-nextjs-stack-i-reuse',
      publishedAt: '2026-08-10T12:00:00.000Z',
      _status: 'published',
      access: { visibility: 'public' },
      excerpt:
        'The production-proven stack from my portfolio rebuild — Next.js 16, Payload, Tailwind v4, Clerk, the AI SDK, and a real testing spine',
    },
  },
  {
    collection: 'posts',
    doc: {
      id: 51,
      title:
        "From Notion to Payload: Why I Rebuilt My Portfolio's Content Engine",
      slug: 'from-notion-to-payload',
      publishedAt: '2026-08-10T12:00:00.000Z',
      _status: 'published',
      access: { visibility: 'public' },
      excerpt:
        'A field report from replacing a five-system Notion content pipeline with Payload embedded in Next.js',
    },
  },
]

/** The whole captured corpus, in the order the collections are listed above. */
export const SITE_FIXTURE_DOCS: SiteFixtureDoc[] = [
  ...WORK_HISTORY,
  ...PROJECTS,
  ...TECH_STACK,
  ...USES,
  ...POSTS,
]

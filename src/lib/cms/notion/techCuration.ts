import {
  notionCreatePage,
  notionGetDataSource,
  notionUpdatePage,
} from '@/lib/cms/notion/client'
import { getNotionTechDataSourceId } from '@/lib/cms/notion/config'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import {
  getProperty,
  propertyToBoolean,
  propertyToDate,
  propertyToText,
} from '@/lib/cms/notion/property'
import type { NotionPage } from '@/lib/cms/notion/contracts'
import { collectGithubTechSignals } from '@/lib/integrations/github/techSignals'
import { uploadRemoteImageToCloudinary } from '@/lib/media/cloudinary'

type TechSignal = {
  key: string
  score: number
  repoCount: number
  repos: string[]
  sources: string[]
}

type TechCatalogEntry = {
  canonicalName: string
  slug: string
  category: string
  referenceUrl: string
  referenceLabel: string
  summary: string
  logoSourceUrl?: string
}

type TechSchema = {
  dataSourceId: string
  titlePropertyName: string
  propertyTypesByName: Map<string, string>
  optionsByPropertyName: Map<string, string[]>
}

type TechRow = {
  page: NotionPage
  name: string
  slug: string
  status: string
  summary: string
  referenceUrl: string
  referenceLabel: string
  logoUrl: string
  manualOverride: boolean
  automationManaged: boolean
  usageScore: number
  repoCount: number
  firstSeenInGithub: string
}

type TechCurationIssue = {
  step: string
  message: string
  details?: unknown
}

export type TechCurationResult = {
  ok: boolean
  enabled: boolean
  dryRun: boolean
  startedAt: string
  owner: string
  scannedRepos: number
  matchedSignals: number
  candidates: number
  updated: number
  created: number
  telemetryBackfilled: number
  integrityBackfilled: number
  staleFlaggedToReview: number
  skippedManualOverride: number
  skippedUnknown: number
  errors: TechCurationIssue[]
  preview: Array<{
    tech: string
    score: number
    repoCount: number
    action: 'update' | 'create' | 'skip' | 'stale-review'
  }>
}

type TechConfig = {
  enabled: boolean
  dryRun: boolean
  minScore: number
  maxCandidates: number
  autoCreate: boolean
  updateExisting: boolean
  defaultCreateStatus: string
  includeUnmapped: boolean
  enforceIntegrity: boolean
  requireAutomationManagedForUpdates: boolean
}

const MAX_PREVIEW = 30

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback
  }
  const raw = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false
  }
  return fallback
}

function parseNumberEnv(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = value ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function resolveConfig(): TechConfig {
  return {
    enabled: parseBooleanEnv(process.env.TECH_CURATION_ENABLED, true),
    dryRun: parseBooleanEnv(process.env.TECH_CURATION_DRY_RUN, false),
    minScore: parseNumberEnv(process.env.TECH_CURATION_MIN_SCORE, 4, 1, 100),
    maxCandidates: parseNumberEnv(
      process.env.TECH_CURATION_MAX_CANDIDATES,
      60,
      1,
      500,
    ),
    autoCreate: parseBooleanEnv(process.env.TECH_CURATION_AUTO_CREATE, true),
    updateExisting: parseBooleanEnv(
      process.env.TECH_CURATION_UPDATE_EXISTING,
      true,
    ),
    defaultCreateStatus:
      process.env.TECH_CURATION_DEFAULT_CREATE_STATUS?.trim() || 'Review',
    includeUnmapped: parseBooleanEnv(
      process.env.TECH_CURATION_INCLUDE_UNMAPPED,
      false,
    ),
    enforceIntegrity: parseBooleanEnv(
      process.env.TECH_CURATION_ENFORCE_INTEGRITY,
      true,
    ),
    requireAutomationManagedForUpdates: parseBooleanEnv(
      process.env.TECH_CURATION_REQUIRE_AUTOMATION_MANAGED_FOR_UPDATES,
      true,
    ),
  }
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function findPropertyName(schema: TechSchema, aliases: string[]) {
  const names = Array.from(schema.propertyTypesByName.keys())
  for (const alias of aliases) {
    const key = normalized(alias)
    const found = names.find((name) => normalized(name) === key)
    if (found) {
      return found
    }
  }
  return null
}

async function loadSchema(dataSourceId: string): Promise<TechSchema> {
  const response = (await notionGetDataSource(dataSourceId)) as {
    properties?: Record<
      string,
      {
        type?: string
        options?: Array<{ name?: string }>
      }
    >
  }

  const propertyTypesByName = new Map<string, string>()
  const optionsByPropertyName = new Map<string, string[]>()
  let titlePropertyName = 'Name'

  for (const [name, prop] of Object.entries(response.properties ?? {})) {
    const type = prop?.type ?? ''
    propertyTypesByName.set(name, type)
    if (type === 'title') {
      titlePropertyName = name
    }

    const options = Array.isArray(prop?.options)
      ? prop.options
          .map((option) => option.name?.trim() || '')
          .filter((option): option is string => option.length > 0)
      : []
    if (options.length > 0) {
      optionsByPropertyName.set(name, options)
    }
  }

  return {
    dataSourceId,
    titlePropertyName,
    propertyTypesByName,
    optionsByPropertyName,
  }
}

function getAllowedOptions(schema: TechSchema, aliases: string[]) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return []
  }

  return schema.optionsByPropertyName.get(propertyName) ?? []
}

function coerceSelect(
  desired: string,
  allowed: string[],
  fallback?: string,
): string | null {
  if (allowed.length === 0) {
    return desired || fallback || null
  }

  const found = allowed.find(
    (option) => normalized(option) === normalized(desired),
  )
  if (found) {
    return found
  }

  if (fallback) {
    const fallbackMatch = allowed.find(
      (option) => normalized(option) === normalized(fallback),
    )
    if (fallbackMatch) {
      return fallbackMatch
    }
  }

  return null
}

function setTitleProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  value: string,
) {
  target[schema.titlePropertyName] = {
    title: [{ type: 'text', text: { content: value } }],
  }
}

function setTextProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  value: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName || !value.trim()) {
    return
  }

  const type = schema.propertyTypesByName.get(propertyName)
  if (type === 'rich_text' || type === 'text') {
    target[propertyName] = {
      rich_text: [{ type: 'text', text: { content: value } }],
    }
  } else if (type === 'title') {
    target[propertyName] = {
      title: [{ type: 'text', text: { content: value } }],
    }
  }
}

function setUrlProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  value: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName || !value.trim()) {
    return
  }

  const type = schema.propertyTypesByName.get(propertyName)
  if (type === 'url') {
    target[propertyName] = { url: value }
  } else {
    setTextProperty(schema, target, aliases, value)
  }
}

function setSelectProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  desired: string,
  fallback?: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return
  }

  const type = schema.propertyTypesByName.get(propertyName)
  const options = schema.optionsByPropertyName.get(propertyName) ?? []
  const selected = coerceSelect(desired, options, fallback)
  if (!selected) {
    return
  }

  if (type === 'select') {
    target[propertyName] = { select: { name: selected } }
  } else if (type === 'status') {
    target[propertyName] = { status: { name: selected } }
  } else {
    setTextProperty(schema, target, aliases, selected)
  }
}

function setCheckboxProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  value: boolean,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return
  }
  const type = schema.propertyTypesByName.get(propertyName)
  if (type === 'checkbox') {
    target[propertyName] = { checkbox: value }
  }
}

function setMultiSelectProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  values: string[],
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return
  }

  const type = schema.propertyTypesByName.get(propertyName)
  if (type !== 'multi_select') {
    if (values.length > 0) {
      setTextProperty(schema, target, aliases, values.join(', '))
    }
    return
  }

  if (values.length === 0) {
    target[propertyName] = { multi_select: [] }
    return
  }

  const uniqueValues = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  )
  if (uniqueValues.length === 0) {
    return
  }

  target[propertyName] = {
    multi_select: uniqueValues.map((name) => ({ name })),
  }
}

function setNumberProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  value: number,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName || !Number.isFinite(value)) {
    return
  }

  if (schema.propertyTypesByName.get(propertyName) === 'number') {
    target[propertyName] = { number: value }
  }
}

function setDateProperty(
  schema: TechSchema,
  target: Record<string, unknown>,
  aliases: string[],
  isoValue: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName || !isoValue) {
    return
  }

  if (schema.propertyTypesByName.get(propertyName) === 'date') {
    target[propertyName] = { date: { start: isoValue } }
  }
}

// TODO(tech-curation): Extract catalog entries to a dedicated module
// (e.g. techCatalogEntries.ts) to reduce file size/churn in this workflow file.
function buildCatalog() {
  const entries: TechCatalogEntry[] = [
    {
      canonicalName: 'TypeScript',
      slug: 'typescript',
      category: 'Frontend',
      referenceUrl: 'https://www.typescriptlang.org/',
      referenceLabel: 'typescriptlang.org',
      summary: 'Strongly typed JavaScript for safer, scalable web apps.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/3591786?s=200&v=4',
    },
    {
      canonicalName: 'JavaScript',
      slug: 'javascript',
      category: 'Frontend',
      referenceUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
      referenceLabel: 'MDN JavaScript',
      summary: 'Core language for frontend and backend web development.',
      logoSourceUrl:
        'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png',
    },
    {
      canonicalName: 'Node.js',
      slug: 'node-js',
      category: 'Backend',
      referenceUrl: 'https://nodejs.org/en',
      referenceLabel: 'nodejs.org',
      summary: 'JavaScript runtime for backend services and tooling.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/9950313?s=200&v=4',
    },
    {
      canonicalName: 'React',
      slug: 'react',
      category: 'Frontend',
      referenceUrl: 'https://react.dev/',
      referenceLabel: 'react.dev',
      summary: 'Component-based UI library for modern frontend apps.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/6412038?s=200&v=4',
    },
    {
      canonicalName: 'Next.js',
      slug: 'next-js',
      category: 'Framework',
      referenceUrl: 'https://nextjs.org/',
      referenceLabel: 'nextjs.org',
      summary: 'React framework for full-stack web applications.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/14985020?s=200&v=4',
    },
    {
      canonicalName: 'Tailwind CSS',
      slug: 'tailwind-css',
      category: 'Frontend',
      referenceUrl: 'https://tailwindcss.com/',
      referenceLabel: 'tailwindcss.com',
      summary: 'Utility-first CSS framework for rapid UI styling.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/67109815?s=200&v=4',
    },
    {
      canonicalName: 'PostgreSQL',
      slug: 'postgresql',
      category: 'Data',
      referenceUrl: 'https://www.postgresql.org/',
      referenceLabel: 'postgresql.org',
      summary: 'Production-grade relational database for app data.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/177543?s=200&v=4',
    },
    {
      canonicalName: 'Prisma',
      slug: 'prisma',
      category: 'Data',
      referenceUrl: 'https://www.prisma.io/',
      referenceLabel: 'prisma.io',
      summary: 'Type-safe database toolkit and ORM for Node.js.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/17219288?s=200&v=4',
    },
    {
      canonicalName: 'Docker',
      slug: 'docker',
      category: 'Tooling',
      referenceUrl: 'https://www.docker.com/',
      referenceLabel: 'docker.com',
      summary: 'Container tooling for reliable local/dev/prod parity.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/5429470?s=200&v=4',
    },
    {
      canonicalName: 'Vitest',
      slug: 'vitest',
      category: 'Testing',
      referenceUrl: 'https://vitest.dev/',
      referenceLabel: 'vitest.dev',
      summary: 'Fast unit testing framework with Vite-native ergonomics.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/65625612?s=200&v=4',
    },
    {
      canonicalName: 'Jest',
      slug: 'jest',
      category: 'Testing',
      referenceUrl: 'https://jestjs.io/',
      referenceLabel: 'jestjs.io',
      summary: 'Widely adopted JavaScript test runner and assertion toolset.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/103283236?s=200&v=4',
    },
    {
      canonicalName: 'MSW',
      slug: 'msw',
      category: 'Testing',
      referenceUrl: 'https://mswjs.io/',
      referenceLabel: 'mswjs.io',
      summary: 'Network-level API mocking for test and dev environments.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/64750738?s=200&v=4',
    },
    {
      canonicalName: 'OpenAI',
      slug: 'openai',
      category: 'AI',
      referenceUrl: 'https://platform.openai.com/docs/overview',
      referenceLabel: 'OpenAI API docs',
      summary:
        'Model APIs for reasoning, generation, and multimodal workflows.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/14957082?s=200&v=4',
    },
    {
      canonicalName: 'AI SDK',
      slug: 'ai-sdk',
      category: 'AI',
      referenceUrl: 'https://ai-sdk.dev/',
      referenceLabel: 'ai-sdk.dev',
      summary:
        'Type-safe TypeScript SDK for building AI-powered apps with model/provider abstractions.',
      // Intentional: AI SDK is maintained under Vercel, so we use the Vercel org avatar
      // as the canonical logo source until a distinct official AI SDK brand asset is available.
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/14985020?s=200&v=4',
    },
    {
      canonicalName: 'Cloudinary',
      slug: 'cloudinary',
      category: 'Tooling',
      referenceUrl: 'https://cloudinary.com/documentation',
      referenceLabel: 'Cloudinary docs',
      summary: 'Media management and delivery pipeline for production assets.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/1460763?s=200&v=4',
    },
    {
      canonicalName: 'Vercel',
      slug: 'vercel',
      category: 'Tooling',
      referenceUrl: 'https://vercel.com/docs',
      referenceLabel: 'Vercel docs',
      summary: 'Hosting platform optimized for Next.js and frontend delivery.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/14985020?s=200&v=4',
    },
    {
      canonicalName: 'Playwright',
      slug: 'playwright',
      category: 'Testing',
      referenceUrl: 'https://playwright.dev/',
      referenceLabel: 'playwright.dev',
      summary: 'Cross-browser end-to-end testing and UI automation.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/6154722?s=200&v=4',
    },
    {
      canonicalName: 'GSAP',
      slug: 'gsap',
      category: 'Frontend',
      referenceUrl: 'https://gsap.com/',
      referenceLabel: 'gsap.com',
      summary:
        'High-performance animation platform for production UI motion and storytelling.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/2386673?v=4',
    },
    {
      canonicalName: 'Zustand',
      slug: 'zustand',
      category: 'Frontend',
      referenceUrl: 'https://zustand.docs.pmnd.rs/',
      referenceLabel: 'zustand.docs.pmnd.rs',
      summary:
        'Minimal state management library for React with simple store-based patterns.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/45790596?s=200&v=4',
    },
    {
      canonicalName: 'React Markdown',
      slug: 'react-markdown',
      category: 'Frontend',
      referenceUrl: 'https://github.com/remarkjs/react-markdown',
      referenceLabel: 'remarkjs/react-markdown',
      summary:
        'Markdown-to-React renderer for content-rich interfaces and documentation views.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/16309564?v=4',
    },
    {
      canonicalName: 'Lucide React',
      slug: 'lucide-react',
      category: 'Frontend',
      referenceUrl: 'https://lucide.dev/',
      referenceLabel: 'lucide.dev',
      summary:
        'Open-source icon library with first-class React components and tree-shaking.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/66879934?v=4',
    },
    {
      canonicalName: 'Heroicons',
      slug: 'heroicons',
      category: 'Frontend',
      referenceUrl: 'https://heroicons.com/',
      referenceLabel: 'heroicons.com',
      summary: 'Official Tailwind Labs SVG icon set for modern UI systems.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/67109815?v=4',
    },
    {
      canonicalName: 'SendGrid',
      slug: 'sendgrid',
      category: 'Tooling',
      referenceUrl: 'https://sendgrid.com/',
      referenceLabel: 'sendgrid.com',
      summary:
        'Transactional email platform and API for production-grade delivery workflows.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/181234?v=4',
    },
    {
      canonicalName: 'MongoDB',
      slug: 'mongodb',
      category: 'Data',
      referenceUrl: 'https://www.mongodb.com/',
      referenceLabel: 'mongodb.com',
      summary: 'Document database for flexible schema and scale.',
      logoSourceUrl: 'https://avatars.githubusercontent.com/u/45120?s=200&v=4',
    },
    {
      canonicalName: 'GraphQL',
      slug: 'graphql',
      category: 'Backend',
      referenceUrl: 'https://graphql.org/',
      referenceLabel: 'graphql.org',
      summary:
        'Typed API query language for efficient client-server contracts.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/12972006?s=200&v=4',
    },
    {
      canonicalName: 'Express.js',
      slug: 'express-js',
      category: 'Backend',
      referenceUrl: 'https://expressjs.com/',
      referenceLabel: 'expressjs.com',
      summary: 'Minimal web framework for Node.js APIs and services.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/5658226?s=200&v=4',
    },
    {
      canonicalName: 'Vue.js',
      slug: 'vue-js',
      category: 'Frontend',
      referenceUrl: 'https://vuejs.org/',
      referenceLabel: 'vuejs.org',
      summary: 'Progressive JavaScript framework for declarative UIs.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/6128107?s=200&v=4',
    },
    {
      canonicalName: 'Nuxt',
      slug: 'nuxt',
      category: 'Framework',
      referenceUrl: 'https://nuxt.com/',
      referenceLabel: 'nuxt.com',
      summary: 'Vue framework for server-rendered and full-stack apps.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/23360933?s=200&v=4',
    },
    {
      canonicalName: 'Pinia',
      slug: 'pinia',
      category: 'Frontend',
      referenceUrl: 'https://pinia.vuejs.org/',
      referenceLabel: 'pinia.vuejs.org',
      summary: 'Type-safe state management for Vue applications.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/150351981?s=200&v=4',
    },
    {
      canonicalName: 'Vite',
      slug: 'vite',
      category: 'Tooling',
      referenceUrl: 'https://vite.dev/',
      referenceLabel: 'vite.dev',
      summary: 'Fast frontend build tooling and dev server.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/65625612?s=200&v=4',
    },
    {
      canonicalName: 'React Router',
      slug: 'react-router',
      category: 'Framework',
      referenceUrl: 'https://reactrouter.com/',
      referenceLabel: 'reactrouter.com',
      summary: 'Declarative routing for React applications.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/63101355?s=200&v=4',
    },
    {
      canonicalName: 'TanStack',
      slug: 'tanstack',
      category: 'Tooling',
      referenceUrl: 'https://tanstack.com/',
      referenceLabel: 'tanstack.com',
      summary: 'Developer tooling ecosystem for data-driven web apps.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/72518640?s=200&v=4',
    },
    {
      canonicalName: 'Zod',
      slug: 'zod',
      category: 'Tooling',
      referenceUrl: 'https://zod.dev/',
      referenceLabel: 'zod.dev',
      summary: 'TypeScript-first schema validation with static type inference.',
      logoSourceUrl:
        'https://avatars.githubusercontent.com/u/3084745?s=200&v=4',
    },
  ]

  const byKey = new Map<string, TechCatalogEntry>()
  for (const entry of entries) {
    byKey.set(normalized(entry.slug), entry)
    byKey.set(normalized(entry.canonicalName), entry)
  }
  return byKey
}

function toSignal(signal: {
  key: string
  score: number
  repos: Set<string>
  reasons: string[]
}): TechSignal {
  const reasonLabelByKey: Record<string, string> = {
    'primary-language': 'Primary Language',
    'language-breakdown': 'Language Breakdown',
    topic: 'Topic',
    package: 'Package',
    'tooling-file': 'Tooling File',
    'package-manager': 'Package Manager',
  }

  return {
    key: signal.key,
    score: signal.score,
    repos: Array.from(signal.repos).sort(),
    repoCount: signal.repos.size,
    sources: Array.from(
      new Set(
        (signal.reasons || [])
          .map((reason) => reasonLabelByKey[reason] || reason)
          .filter(Boolean),
      ),
    ),
  }
}

function extractRows(pages: NotionPage[]): TechRow[] {
  return pages.map((page) => ({
    page,
    name: propertyToText(getProperty(page.properties, ['Name', 'Title'])),
    slug: propertyToText(getProperty(page.properties, ['Slug'])),
    status: propertyToText(getProperty(page.properties, ['Status'])),
    summary: propertyToText(
      getProperty(page.properties, ['Summary', 'Description']),
    ),
    referenceUrl: propertyToText(
      getProperty(page.properties, ['Reference URL', 'URL', 'Website']),
    ),
    referenceLabel: propertyToText(
      getProperty(page.properties, ['Reference Label']),
    ),
    logoUrl: propertyToText(getProperty(page.properties, ['Logo URL'])),
    manualOverride:
      propertyToBoolean(
        getProperty(page.properties, [
          'Manual Override',
          'Manual Curation',
          'Lock Auto Updates',
        ]),
      ) ?? false,
    automationManaged:
      propertyToBoolean(
        getProperty(page.properties, [
          'Automation Managed',
          'Managed By Automation',
          'Auto Managed',
        ]),
      ) ?? false,
    usageScore:
      Number(
        propertyToText(
          getProperty(page.properties, ['Usage Score', 'Signal Score']),
        ),
      ) || 0,
    repoCount:
      Number(propertyToText(getProperty(page.properties, ['Repo Count']))) || 0,
    firstSeenInGithub: propertyToDate(
      getProperty(page.properties, ['First Seen In GitHub', 'First Seen']),
    ),
  }))
}

function rowKey(row: TechRow) {
  return normalized(row.slug || row.name)
}

function isCloudinaryUrl(url: string) {
  return url.startsWith('https://res.cloudinary.com/')
}

function resolveTechLogosFolderPath() {
  return (process.env.CLOUDINARY_CMS_TECH_LOGOS_FOLDER || 'bp-portfolio/tech')
    .trim()
    .replace(/^\/+|\/+$/g, '')
}

function isTechLogoPathCompliant(url: string, slug: string) {
  if (!isCloudinaryUrl(url)) {
    return false
  }
  const folder = resolveTechLogosFolderPath()
  return url.includes(`/${folder}/${slug}/logo`)
}

function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function deriveReferenceLabel(referenceUrl: string) {
  if (!isValidHttpUrl(referenceUrl)) {
    return ''
  }
  try {
    return new URL(referenceUrl).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function resolveLogoUrl(
  entry: TechCatalogEntry,
  currentLogoUrl: string,
  options: { allowUpload: boolean },
): Promise<string> {
  if (isCloudinaryUrl(currentLogoUrl)) {
    return currentLogoUrl
  }

  if (!entry.logoSourceUrl) {
    return currentLogoUrl
  }

  if (!options.allowUpload) {
    return isValidHttpUrl(currentLogoUrl) ? currentLogoUrl : entry.logoSourceUrl
  }

  try {
    const uploaded = await uploadRemoteImageToCloudinary({
      imageUrl: entry.logoSourceUrl,
      publicId: `${entry.slug}/logo`,
    })
    return uploaded.url
  } catch (error) {
    console.warn('[cms:notion] tech logo upload failed', {
      slug: entry.slug,
      error: error instanceof Error ? error.message : String(error),
    })
    if (isValidHttpUrl(currentLogoUrl)) {
      return currentLogoUrl
    }
    return entry.logoSourceUrl
  }
}

function buildCandidateSignals(
  rawSignals: Array<{
    key: string
    score: number
    repos: Set<string>
    reasons: string[]
  }>,
  config: TechConfig,
  catalogKeys: Set<string>,
) {
  const normalizedCatalogKeys = new Set(
    Array.from(catalogKeys).map((key) => normalized(key)),
  )

  const mapped = rawSignals.map(toSignal)
  const catalogKnown = mapped
    .filter(
      (signal) =>
        signal.score > 0 && normalizedCatalogKeys.has(normalized(signal.key)),
    )
    .sort((a, b) => b.score - a.score)

  const candidates: Array<ReturnType<typeof toSignal>> = []
  const seen = new Set<string>()
  for (const signal of catalogKnown) {
    const key = normalized(signal.key)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    candidates.push(signal)
    if (candidates.length >= config.maxCandidates) {
      return candidates
    }
  }

  const aboveThreshold = mapped
    .filter((signal) => signal.score >= config.minScore)
    .sort((a, b) => b.score - a.score)

  for (const signal of aboveThreshold) {
    const key = normalized(signal.key)
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    candidates.push(signal)
    if (candidates.length >= config.maxCandidates) {
      break
    }
  }

  return candidates
}

function buildSignalMaps(
  rawSignals: Array<{
    key: string
    score: number
    repos: Set<string>
    reasons: string[]
  }>,
) {
  const signalScoreByKey = new Map<string, number>()
  const signalReposByKey = new Map<string, string[]>()
  const signalSourcesByKey = new Map<string, string[]>()
  const reasonLabelByKey: Record<string, string> = {
    'primary-language': 'Primary Language',
    'language-breakdown': 'Language Breakdown',
    topic: 'Topic',
    package: 'Package',
    'tooling-file': 'Tooling File',
    'package-manager': 'Package Manager',
  }
  for (const signal of rawSignals) {
    const key = normalized(signal.key)
    signalScoreByKey.set(key, signal.score)
    signalReposByKey.set(key, Array.from(signal.repos).sort())
    const reasonLabels = Array.from(
      new Set(
        (signal.reasons || [])
          .map((reason) => reasonLabelByKey[reason] || reason)
          .filter(Boolean),
      ),
    )
    signalSourcesByKey.set(key, reasonLabels)
  }
  return { signalScoreByKey, signalReposByKey, signalSourcesByKey }
}

/**
 * Runs GitHub-signal-driven curation against the Portfolio CMS Tech data source.
 *
 * @param args Optional runtime overrides.
 * @param args.dryRun When true, computes candidates/preview without mutating
 * Notion rows; Cloudinary logo uploads and Notion create/update writes are skipped.
 * @returns Aggregated cron result telemetry (`TechCurationResult`) including
 * counts, preview rows, and structured errors.
 *
 * Behavior notes:
 * - Honors feature/config gates from `resolveConfig()` (for example `enabled`,
 *   owner/repo limits, and include-unmapped behavior).
 * - Loads existing Tech rows and schema, then reconciles mapped catalog signals.
 * - In non-dry runs, applies Notion row updates/creates and backfill repairs.
 * - Returns structured failures for GitHub/Notion stages; thrown transport errors
 *   from underlying helpers may still propagate to the caller.
 */
export async function runTechCurationCron(args?: {
  dryRun?: boolean
}): Promise<TechCurationResult> {
  const startedAt = new Date().toISOString()
  const config = resolveConfig()
  const dryRun = args?.dryRun ?? config.dryRun

  if (!config.enabled) {
    return {
      ok: true,
      enabled: false,
      dryRun,
      startedAt,
      owner: process.env.GITHUB_OWNER || process.env.GITHUB_TECH_OWNER || '',
      scannedRepos: 0,
      matchedSignals: 0,
      candidates: 0,
      updated: 0,
      created: 0,
      telemetryBackfilled: 0,
      integrityBackfilled: 0,
      staleFlaggedToReview: 0,
      skippedManualOverride: 0,
      skippedUnknown: 0,
      errors: [],
      preview: [],
    }
  }

  const errors: TechCurationIssue[] = []
  const preview: TechCurationResult['preview'] = []

  const github = await collectGithubTechSignals()
  if (!github.ok) {
    return {
      ok: false,
      enabled: true,
      dryRun,
      startedAt,
      owner: github.owner,
      scannedRepos: github.scannedRepos,
      matchedSignals: github.signals.length,
      candidates: 0,
      updated: 0,
      created: 0,
      telemetryBackfilled: 0,
      integrityBackfilled: 0,
      staleFlaggedToReview: 0,
      skippedManualOverride: 0,
      skippedUnknown: 0,
      errors: github.errors.map((message) => ({
        step: 'collect-github-signals',
        message,
      })),
      preview: [],
    }
  }

  const dataSourceId = getNotionTechDataSourceId()
  const schema = await loadSchema(dataSourceId)
  const pages = await queryAllDataSourcePages(dataSourceId, {
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
  })

  const rows = extractRows(pages)
  const rowsByKey = new Map<string, TechRow>()
  for (const row of rows) {
    const key = rowKey(row)
    if (key) {
      rowsByKey.set(key, row)
    }
  }

  const catalog = buildCatalog()
  const candidateSignals = buildCandidateSignals(
    github.signals,
    config,
    new Set(catalog.keys()),
  )

  let updated = 0
  let created = 0
  let telemetryBackfilled = 0
  let integrityBackfilled = 0
  const staleFlaggedToReview = 0
  let skippedManualOverride = 0
  let skippedUnknown = 0

  const categoryOptions = getAllowedOptions(schema, ['Category'])
  const statusOptions = getAllowedOptions(schema, ['Status'])
  const hasAutomationManagedProperty =
    findPropertyName(schema, [
      'Automation Managed',
      'Managed By Automation',
      'Auto Managed',
    ]) !== null

  for (const signal of candidateSignals) {
    const catalogEntry =
      catalog.get(normalized(signal.key)) ||
      (config.includeUnmapped
        ? {
            canonicalName: signal.key,
            slug: toSlug(signal.key),
            category: 'Tooling',
            referenceUrl: '',
            referenceLabel: '',
            summary: `${signal.key} observed in active GitHub repositories.`,
          }
        : null)

    if (!catalogEntry) {
      skippedUnknown += 1
      preview.push({
        tech: signal.key,
        score: signal.score,
        repoCount: signal.repoCount,
        action: 'skip',
      })
      continue
    }

    const key = normalized(catalogEntry.slug || catalogEntry.canonicalName)
    const existing = rowsByKey.get(key)

    if (existing?.manualOverride) {
      skippedManualOverride += 1
      preview.push({
        tech: catalogEntry.canonicalName,
        score: signal.score,
        repoCount: signal.repoCount,
        action: 'skip',
      })
      continue
    }

    if (
      existing &&
      config.requireAutomationManagedForUpdates &&
      (!hasAutomationManagedProperty || !existing.automationManaged)
    ) {
      preview.push({
        tech: catalogEntry.canonicalName,
        score: signal.score,
        repoCount: signal.repoCount,
        action: 'skip',
      })
      continue
    }

    const logoUrl = await resolveLogoUrl(
      catalogEntry,
      existing?.logoUrl || '',
      {
        allowUpload: !dryRun,
      },
    )

    if (existing && config.updateExisting) {
      const properties: Record<string, unknown> = {}
      const observed = signal.score > 0
      const targetLogoSlug = toSlug(
        existing.slug || existing.name || catalogEntry.slug,
      )
      const needsLogoMigration =
        !existing.logoUrl ||
        !isTechLogoPathCompliant(existing.logoUrl, targetLogoSlug)
      if (needsLogoMigration && !dryRun) {
        try {
          const uploadSource =
            existing.logoUrl && isValidHttpUrl(existing.logoUrl)
              ? existing.logoUrl
              : logoUrl
          const uploaded = await uploadRemoteImageToCloudinary({
            imageUrl: uploadSource,
            publicId: `${targetLogoSlug}/logo`,
          })
          setUrlProperty(schema, properties, ['Logo URL'], uploaded.url)
        } catch {
          setUrlProperty(schema, properties, ['Logo URL'], logoUrl)
        }
      }
      if (!existing.summary && catalogEntry.summary) {
        setTextProperty(
          schema,
          properties,
          ['Summary', 'Description'],
          catalogEntry.summary,
        )
      }
      const validReferenceUrl = isValidHttpUrl(existing.referenceUrl)
      if (!validReferenceUrl && catalogEntry.referenceUrl) {
        setUrlProperty(
          schema,
          properties,
          ['Reference URL', 'URL', 'Website'],
          catalogEntry.referenceUrl,
        )
      }
      if (!existing.referenceLabel) {
        const labelSource = validReferenceUrl
          ? existing.referenceUrl
          : catalogEntry.referenceUrl
        const fallbackLabel =
          deriveReferenceLabel(labelSource) || catalogEntry.referenceLabel
        if (fallbackLabel) {
          setTextProperty(
            schema,
            properties,
            ['Reference Label'],
            fallbackLabel,
          )
        }
      }
      setNumberProperty(
        schema,
        properties,
        ['Usage Score', 'Signal Score'],
        signal.score,
      )
      setNumberProperty(schema, properties, ['Repo Count'], signal.repoCount)
      setCheckboxProperty(schema, properties, ['GitHub Observed'], observed)
      setNumberProperty(
        schema,
        properties,
        ['GitHub Repo Mentions'],
        signal.repoCount,
      )
      setDateProperty(
        schema,
        properties,
        ['GitHub Last Scanned At'],
        new Date().toISOString(),
      )
      setTextProperty(
        schema,
        properties,
        ['Source Repos', 'Source Repository List'],
        signal.repos.join(', '),
      )
      setMultiSelectProperty(
        schema,
        properties,
        ['Signal Sources', 'Source Signals'],
        signal.sources,
      )
      setDateProperty(
        schema,
        properties,
        ['Last Seen In GitHub', 'Last Seen'],
        observed ? new Date().toISOString() : '',
      )
      if (!existing.firstSeenInGithub && signal.score > 0) {
        setDateProperty(
          schema,
          properties,
          ['First Seen In GitHub', 'First Seen'],
          new Date().toISOString(),
        )
      }
      setDateProperty(
        schema,
        properties,
        ['Updated At'],
        new Date().toISOString(),
      )
      if (Object.keys(properties).length === 0) {
        preview.push({
          tech: catalogEntry.canonicalName,
          score: signal.score,
          repoCount: signal.repoCount,
          action: 'skip',
        })
        continue
      }

      if (!dryRun) {
        try {
          await notionUpdatePage(existing.page.id, { properties })
        } catch (error) {
          errors.push({
            step: 'update-existing-row',
            message:
              error instanceof Error ? error.message : 'Failed to update row',
            details: {
              pageId: existing.page.id,
              tech: catalogEntry.canonicalName,
            },
          })
          continue
        }
      }

      updated += 1
      preview.push({
        tech: catalogEntry.canonicalName,
        score: signal.score,
        repoCount: signal.repoCount,
        action: 'update',
      })
      continue
    }

    if (!existing && config.autoCreate) {
      const properties: Record<string, unknown> = {}
      const observed = signal.score > 0
      setTitleProperty(schema, properties, catalogEntry.canonicalName)
      setTextProperty(schema, properties, ['Slug'], catalogEntry.slug)
      setTextProperty(
        schema,
        properties,
        ['Summary', 'Description'],
        catalogEntry.summary,
      )
      setSelectProperty(
        schema,
        properties,
        ['Category'],
        catalogEntry.category,
        categoryOptions[0],
      )
      setSelectProperty(
        schema,
        properties,
        ['Status'],
        config.defaultCreateStatus,
        statusOptions[0],
      )
      setUrlProperty(
        schema,
        properties,
        ['Reference URL', 'URL', 'Website'],
        catalogEntry.referenceUrl,
      )
      setTextProperty(
        schema,
        properties,
        ['Reference Label'],
        catalogEntry.referenceLabel || catalogEntry.referenceUrl,
      )
      setUrlProperty(schema, properties, ['Logo URL'], logoUrl)
      setNumberProperty(
        schema,
        properties,
        ['Usage Score', 'Signal Score'],
        signal.score,
      )
      setNumberProperty(schema, properties, ['Repo Count'], signal.repoCount)
      setCheckboxProperty(schema, properties, ['GitHub Observed'], observed)
      setNumberProperty(
        schema,
        properties,
        ['GitHub Repo Mentions'],
        signal.repoCount,
      )
      setDateProperty(
        schema,
        properties,
        ['GitHub Last Scanned At'],
        new Date().toISOString(),
      )
      setTextProperty(
        schema,
        properties,
        ['Source Repos', 'Source Repository List'],
        signal.repos.join(', '),
      )
      setMultiSelectProperty(
        schema,
        properties,
        ['Signal Sources', 'Source Signals'],
        signal.sources,
      )
      setDateProperty(
        schema,
        properties,
        ['Last Seen In GitHub', 'Last Seen'],
        new Date().toISOString(),
      )
      if (signal.score > 0) {
        setDateProperty(
          schema,
          properties,
          ['First Seen In GitHub', 'First Seen'],
          new Date().toISOString(),
        )
      }
      setDateProperty(
        schema,
        properties,
        ['Updated At'],
        new Date().toISOString(),
      )
      if (hasAutomationManagedProperty) {
        const automationManagedName = findPropertyName(schema, [
          'Automation Managed',
          'Managed By Automation',
          'Auto Managed',
        ])
        if (automationManagedName) {
          const type = schema.propertyTypesByName.get(automationManagedName)
          if (type === 'checkbox') {
            properties[automationManagedName] = { checkbox: true }
          }
        }
      }

      if (!dryRun) {
        try {
          await notionCreatePage({
            parent: { data_source_id: schema.dataSourceId },
            properties,
          })
        } catch (error) {
          errors.push({
            step: 'create-tech-row',
            message:
              error instanceof Error ? error.message : 'Failed to create row',
            details: {
              tech: catalogEntry.canonicalName,
            },
          })
          continue
        }
      }

      created += 1
      preview.push({
        tech: catalogEntry.canonicalName,
        score: signal.score,
        repoCount: signal.repoCount,
        action: 'create',
      })
    }
  }

  // Keep telemetry complete for managed rows, including zero-signal rows.
  const { signalScoreByKey, signalReposByKey, signalSourcesByKey } =
    buildSignalMaps(github.signals)
  if (
    config.updateExisting &&
    (!config.requireAutomationManagedForUpdates || hasAutomationManagedProperty)
  ) {
    for (const row of rows) {
      const key = rowKey(row)
      if (!key || row.manualOverride) {
        continue
      }
      if (
        config.requireAutomationManagedForUpdates &&
        hasAutomationManagedProperty &&
        !row.automationManaged
      ) {
        continue
      }

      const score = signalScoreByKey.get(key) ?? 0
      const repos = signalReposByKey.get(key) ?? []
      const repoCount = repos.length
      const observed = score > 0

      const properties: Record<string, unknown> = {}
      setNumberProperty(
        schema,
        properties,
        ['Usage Score', 'Signal Score'],
        score,
      )
      setNumberProperty(schema, properties, ['Repo Count'], repoCount)
      setCheckboxProperty(schema, properties, ['GitHub Observed'], observed)
      setNumberProperty(schema, properties, ['GitHub Repo Mentions'], repoCount)
      setDateProperty(
        schema,
        properties,
        ['GitHub Last Scanned At'],
        new Date().toISOString(),
      )
      setTextProperty(
        schema,
        properties,
        ['Source Repos', 'Source Repository List'],
        repos.length > 0 ? repos.join(', ') : 'None detected in latest scan.',
      )
      setMultiSelectProperty(
        schema,
        properties,
        ['Signal Sources', 'Source Signals'],
        signalSourcesByKey.get(key) ?? [],
      )
      if (score > 0) {
        setDateProperty(
          schema,
          properties,
          ['Last Seen In GitHub', 'Last Seen'],
          new Date().toISOString(),
        )
        if (!row.firstSeenInGithub) {
          setDateProperty(
            schema,
            properties,
            ['First Seen In GitHub', 'First Seen'],
            new Date().toISOString(),
          )
        }
      }

      if (Object.keys(properties).length === 0) {
        continue
      }

      if (!dryRun) {
        try {
          await notionUpdatePage(row.page.id, { properties })
        } catch (error) {
          errors.push({
            step: 'telemetry-backfill',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to backfill telemetry fields',
            details: {
              pageId: row.page.id,
              tech: row.name || row.slug,
            },
          })
          continue
        }
      }

      telemetryBackfilled += 1
    }
  }

  if (config.enforceIntegrity) {
    for (const row of rows) {
      if (row.manualOverride) {
        continue
      }
      if (
        config.requireAutomationManagedForUpdates &&
        hasAutomationManagedProperty &&
        !row.automationManaged
      ) {
        continue
      }

      const key = rowKey(row)
      const catalogEntry = key ? catalog.get(key) : null
      const properties: Record<string, unknown> = {}

      if (!row.summary && catalogEntry?.summary) {
        setTextProperty(
          schema,
          properties,
          ['Summary', 'Description'],
          catalogEntry.summary,
        )
      }

      const validReferenceUrl = isValidHttpUrl(row.referenceUrl)
      if (!validReferenceUrl && catalogEntry?.referenceUrl) {
        setUrlProperty(
          schema,
          properties,
          ['Reference URL', 'URL', 'Website'],
          catalogEntry.referenceUrl,
        )
      }

      if (!row.referenceLabel) {
        const fallbackLabel =
          deriveReferenceLabel(
            validReferenceUrl
              ? row.referenceUrl
              : catalogEntry?.referenceUrl || '',
          ) || catalogEntry?.referenceLabel
        if (fallbackLabel) {
          setTextProperty(
            schema,
            properties,
            ['Reference Label'],
            fallbackLabel,
          )
        }
      }

      const currentOrCatalogLogoUrl =
        row.logoUrl || catalogEntry?.logoSourceUrl || ''
      const rowLogoSlug = toSlug(row.slug || row.name)
      const needsLogoMigration =
        currentOrCatalogLogoUrl &&
        (!isCloudinaryUrl(row.logoUrl) ||
          !isTechLogoPathCompliant(row.logoUrl, rowLogoSlug))
      if (needsLogoMigration && !dryRun) {
        try {
          const uploaded = await uploadRemoteImageToCloudinary({
            imageUrl: currentOrCatalogLogoUrl,
            publicId: `${rowLogoSlug}/logo`,
          })
          setUrlProperty(schema, properties, ['Logo URL'], uploaded.url)
        } catch (error) {
          const fallbackLogoUrl =
            catalogEntry?.logoSourceUrl &&
            catalogEntry.logoSourceUrl !== currentOrCatalogLogoUrl
              ? catalogEntry.logoSourceUrl
              : ''
          if (fallbackLogoUrl) {
            try {
              const fallbackUploaded = await uploadRemoteImageToCloudinary({
                imageUrl: fallbackLogoUrl,
                publicId: `${toSlug(row.slug || row.name)}/logo`,
              })
              setUrlProperty(
                schema,
                properties,
                ['Logo URL'],
                fallbackUploaded.url,
              )
            } catch (fallbackError) {
              errors.push({
                step: 'integrity-logo-upload',
                message:
                  fallbackError instanceof Error
                    ? fallbackError.message
                    : 'Failed to upload logo during integrity pass',
                details: {
                  pageId: row.page.id,
                  tech: row.name || row.slug,
                },
              })
            }
          } else {
            errors.push({
              step: 'integrity-logo-upload',
              message:
                error instanceof Error
                  ? error.message
                  : 'Failed to upload logo during integrity pass',
              details: {
                pageId: row.page.id,
                tech: row.name || row.slug,
              },
            })
          }
        }
      }

      if (Object.keys(properties).length === 0) {
        continue
      }

      setDateProperty(
        schema,
        properties,
        ['Updated At'],
        new Date().toISOString(),
      )

      if (!dryRun) {
        try {
          await notionUpdatePage(row.page.id, { properties })
        } catch (error) {
          errors.push({
            step: 'integrity-pass',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to apply integrity pass updates',
            details: {
              pageId: row.page.id,
              tech: row.name || row.slug,
            },
          })
          continue
        }
      }

      integrityBackfilled += 1
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    dryRun,
    startedAt,
    owner: github.owner,
    scannedRepos: github.scannedRepos,
    matchedSignals: github.signals.length,
    candidates: candidateSignals.length,
    updated,
    created,
    telemetryBackfilled,
    integrityBackfilled,
    staleFlaggedToReview,
    skippedManualOverride,
    skippedUnknown,
    errors,
    preview: preview.slice(0, MAX_PREVIEW),
  }
}

import { setTimeout as sleep } from 'node:timers/promises'

type GithubRepo = {
  name: string
  full_name: string
  private: boolean
  archived: boolean
  fork: boolean
  language: string | null
  topics?: string[]
  pushed_at?: string
  default_branch?: string
  languages_url: string
}

type GithubTreeEntry = {
  path?: string
  type?: 'blob' | 'tree'
  sha?: string
}

type GithubTechSignal = {
  key: string
  score: number
  repos: Set<string>
  reasons: string[]
}

type RepoToolingSignal = {
  key: string
  score: number
  reason: string
}

type GithubTechSignalsResult = {
  ok: boolean
  owner: string
  scannedRepos: number
  signals: GithubTechSignal[]
  errors: string[]
}

type ResolveConfigResult =
  | { ok: false; reason: string }
  | {
      ok: true
      owner: string
      token: string
      repoLimit: number
      maxRepoAgeMonths: number
      maxPackageJsonFilesPerRepo: number
      includePrivate: boolean
      debugPackageScan: boolean
      allowlist: Set<string>
      denylist: Set<string>
    }

const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

class GithubHttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubHttpError'
    this.status = status
  }
}

function parseBoolean(value: string | undefined, fallback: boolean) {
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

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

function parseList(value: string | undefined) {
  if (!value?.trim()) {
    return new Set<string>()
  }
  return new Set(
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
  )
}

function resolveConfig(): ResolveConfigResult {
  const owner =
    process.env.GITHUB_OWNER?.trim() || process.env.GITHUB_TECH_OWNER?.trim()
  if (!owner) {
    return {
      ok: false,
      reason: 'Missing GITHUB_OWNER (or GITHUB_TECH_OWNER) env variable',
    }
  }

  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) {
    return {
      ok: false,
      reason: 'Missing GITHUB_TOKEN env variable',
    }
  }

  return {
    ok: true,
    owner,
    token,
    repoLimit: parsePositiveInt(process.env.GITHUB_TECH_REPO_LIMIT, 60),
    maxRepoAgeMonths: parsePositiveInt(
      process.env.GITHUB_TECH_MAX_REPO_AGE_MONTHS,
      24,
    ),
    maxPackageJsonFilesPerRepo: parsePositiveInt(
      process.env.GITHUB_TECH_MAX_PACKAGE_JSON_FILES_PER_REPO,
      20,
    ),
    includePrivate: parseBoolean(
      process.env.GITHUB_TECH_INCLUDE_PRIVATE,
      false,
    ),
    debugPackageScan: parseBoolean(
      process.env.GITHUB_TECH_DEBUG_PACKAGE_SCAN,
      false,
    ),
    allowlist: parseList(process.env.GITHUB_TECH_REPOS_ALLOWLIST),
    denylist: parseList(process.env.GITHUB_TECH_REPOS_DENYLIST),
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function coerceTechKey(raw: string) {
  const key = normalizeKey(raw)
  const aliases: Record<string, string> = {
    ts: 'typescript',
    typescript: 'typescript',
    js: 'javascript',
    javascript: 'javascript',
    node: 'nodejs',
    nodejs: 'nodejs',
    'node.js': 'nodejs',
    react: 'react',
    redux: 'redux',
    'next.js': 'nextjs',
    nextjs: 'nextjs',
    next: 'nextjs',
    tailwind: 'tailwindcss',
    'tailwind-css': 'tailwindcss',
    tailwindcss: 'tailwindcss',
    postgres: 'postgresql',
    postgresql: 'postgresql',
    prisma: 'prisma',
    docker: 'docker',
    vitest: 'vitest',
    jest: 'jest',
    msw: 'msw',
    openai: 'openai',
    cloudinary: 'cloudinary',
    vercel: 'vercel',
    playwright: 'playwright',
    mongodb: 'mongodb',
    graphql: 'graphql',
    express: 'expressjs',
    'express.js': 'expressjs',
    vue: 'vuejs',
    'vue.js': 'vuejs',
    nuxt: 'nuxt',
    pinia: 'pinia',
    vite: 'vite',
    'react-router': 'react-router',
    tanstack: 'tanstack',
    'tanstack-query': 'tanstack',
    'react-query': 'tanstack',
    'headless-ui': 'headless-ui',
    'keystone-js': 'keystone-js',
    'the-epic-stack': 'the-epic-stack',
    'react-markdown': 'react-markdown',
    'lucide-react': 'lucide-react',
    heroicons: 'heroicons',
    sendgrid: 'sendgrid',
    gsap: 'gsap',
    zustand: 'zustand',
    ai: 'ai-sdk',
    'ai-sdk': 'ai-sdk',
  }

  return aliases[key] || key
}

function encodeRepoPath(repoFullName: string) {
  const [owner = '', repo = ''] = repoFullName.split('/')
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

function expandDependencySignalKeys(depName: string): string[] {
  const raw = depName.trim().toLowerCase()
  if (!raw || raw.startsWith('@types/')) {
    return []
  }

  const keys = new Set<string>([raw])

  if (raw.startsWith('npm@')) {
    keys.add('npm')
  }
  if (raw.startsWith('yarn@')) {
    keys.add('yarn')
  }
  if (raw.startsWith('pnpm@')) {
    keys.add('pnpm')
  }

  // Strong canonicalization for known scoped ecosystems.
  if (raw.startsWith('@tanstack/')) {
    keys.add('tanstack')
  }
  if (raw.startsWith('@playwright/')) {
    keys.add('playwright')
  }
  if (raw.startsWith('@clerk/')) {
    keys.add('clerk')
  }
  if (raw.startsWith('@radix-ui/')) {
    keys.add('radix-ui')
  }
  if (raw.startsWith('@heroicons/')) {
    keys.add('heroicons')
  }
  if (raw.startsWith('@sendgrid/')) {
    keys.add('sendgrid')
  }
  if (raw.startsWith('@ai-sdk/')) {
    keys.add('ai-sdk')
  }
  if (raw.startsWith('@headlessui/')) {
    keys.add('headless-ui')
  }
  if (raw.startsWith('@keystone-6/') || raw.startsWith('@keystonejs/')) {
    keys.add('keystone-js')
  }
  if (raw.startsWith('@epic-web/') || raw.startsWith('@epic-stack/')) {
    keys.add('the-epic-stack')
  }

  // Generic scoped package fallback: @scope/pkg -> pkg
  const scopedMatch = raw.match(/^@[^/]+\/(.+)$/)
  if (scopedMatch?.[1]) {
    keys.add(scopedMatch[1])
  }

  return Array.from(keys)
}

async function fetchGithubJson<T>(url: string, token: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'bp-portfolio-tech-curation',
        },
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        if (attempt < MAX_RETRIES && RETRYABLE_STATUSES.has(response.status)) {
          await sleep((attempt + 1) * 500)
          continue
        }
        const body = await response.text().catch(() => '')
        throw new GithubHttpError(
          `GitHub request failed (${response.status}) for ${url}: ${body.slice(0, 400)}`,
          response.status,
        )
      }

      return (await response.json()) as T
    } catch (error) {
      const status = error instanceof GithubHttpError ? error.status : undefined
      if (status !== undefined && !RETRYABLE_STATUSES.has(status)) {
        throw error
      }

      const retryableNetworkError =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TypeError')

      if (attempt < MAX_RETRIES && retryableNetworkError) {
        await sleep((attempt + 1) * 500)
        continue
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Unreachable in normal flow: the retry loop either returns a parsed response
  // or throws after MAX_RETRIES with REQUEST_TIMEOUT_MS + backoff handling.
  // This is kept as a defensive terminal path for TypeScript control-flow.
  throw new Error(`GitHub request failed for ${url}`)
}

async function listRepos(config: Extract<ResolveConfigResult, { ok: true }>) {
  const repos: GithubRepo[] = []
  const pageSize = 100
  const ownerPrefix = `${config.owner.toLowerCase()}/`

  for (let page = 1; repos.length < config.repoLimit; page += 1) {
    const endpoint = config.includePrivate
      ? `https://api.github.com/user/repos?sort=updated&direction=desc&per_page=${pageSize}&page=${page}`
      : `https://api.github.com/users/${encodeURIComponent(config.owner)}/repos?sort=updated&direction=desc&per_page=${pageSize}&page=${page}`

    const chunk = await fetchGithubJson<GithubRepo[]>(endpoint, config.token)
    if (!Array.isArray(chunk) || chunk.length === 0) {
      break
    }

    const ownedChunk = config.includePrivate
      ? chunk.filter((repo) =>
          repo.full_name.toLowerCase().startsWith(ownerPrefix),
        )
      : chunk

    repos.push(...ownedChunk)
    if (chunk.length < pageSize) {
      break
    }
  }

  return repos.slice(0, config.repoLimit)
}

function shouldIncludeRepo(
  repo: GithubRepo,
  maxRepoAgeMonths: number,
  allowlist: Set<string>,
  denylist: Set<string>,
) {
  if (repo.archived || repo.fork) {
    return false
  }

  const full = repo.full_name.toLowerCase()
  const short = repo.name.toLowerCase()

  if (denylist.has(full) || denylist.has(short)) {
    return false
  }

  if (allowlist.size > 0) {
    return allowlist.has(full) || allowlist.has(short)
  }

  if (maxRepoAgeMonths > 0) {
    const pushedAtMs = repo.pushed_at ? Date.parse(repo.pushed_at) : Number.NaN
    if (Number.isFinite(pushedAtMs)) {
      const maxAgeMs = maxRepoAgeMonths * 30 * 24 * 60 * 60 * 1000
      const ageMs = Date.now() - pushedAtMs
      if (ageMs > maxAgeMs) {
        return false
      }
    }
  }

  return true
}

function trackSignal(
  bucket: Map<string, GithubTechSignal>,
  rawKey: string,
  score: number,
  repo: string,
  reason: string,
) {
  const key = coerceTechKey(rawKey)
  if (!key || key.length < 2) {
    return
  }

  const existing =
    bucket.get(key) ||
    ({
      key,
      score: 0,
      repos: new Set<string>(),
      reasons: [],
    } satisfies GithubTechSignal)

  existing.score += score
  existing.repos.add(repo)
  if (!existing.reasons.includes(reason)) {
    existing.reasons.push(reason)
  }
  bucket.set(key, existing)
}

async function readRepoLanguages(repo: GithubRepo, token: string) {
  try {
    return await fetchGithubJson<Record<string, number>>(
      repo.languages_url,
      token,
    )
  } catch {
    return {}
  }
}

async function readBlobContent(
  repoFullName: string,
  sha: string,
  token: string,
): Promise<string> {
  const blob = await fetchGithubJson<{ encoding?: string; content?: string }>(
    `https://api.github.com/repos/${encodeRepoPath(repoFullName)}/git/blobs/${encodeURIComponent(sha)}`,
    token,
  )
  if (blob.encoding !== 'base64' || !blob.content) {
    return ''
  }
  return Buffer.from(blob.content, 'base64').toString('utf8')
}

function parseDependencyNamesFromPackageJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as {
      packageManager?: string
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }

    return [
      ...(parsed.packageManager ? [parsed.packageManager] : []),
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.peerDependencies ?? {}),
      ...Object.keys(parsed.optionalDependencies ?? {}),
    ]
  } catch {
    return []
  }
}

async function readRootPackageJsonDependencies(
  repo: GithubRepo,
  token: string,
  branch: string,
) {
  try {
    const tree = await fetchGithubJson<{
      tree?: GithubTreeEntry[]
    }>(
      `https://api.github.com/repos/${encodeRepoPath(repo.full_name)}/git/trees/${encodeURIComponent(branch)}`,
      token,
    )
    const rootManifest = (tree.tree ?? []).find(
      (entry) =>
        entry.type === 'blob' &&
        entry.path?.toLowerCase() === 'package.json' &&
        entry.sha,
    )
    if (!rootManifest?.sha) {
      return []
    }

    const raw = await readBlobContent(repo.full_name, rootManifest.sha, token)
    return parseDependencyNamesFromPackageJson(raw)
  } catch {
    return []
  }
}

async function readPackageJsonDependenciesFromManifests(
  repo: GithubRepo,
  token: string,
  maxFiles: number,
) {
  const branch = repo.default_branch || 'main'
  const deps = new Set<string>(
    await readRootPackageJsonDependencies(repo, token, branch),
  )

  // Fast-path for environments that only want root-level manifests.
  if (maxFiles <= 1) {
    return Array.from(deps)
  }

  const treeUrl = `https://api.github.com/repos/${encodeRepoPath(repo.full_name)}/git/trees/${encodeURIComponent(branch)}?recursive=1`

  try {
    const treeResponse = await fetchGithubJson<{
      tree?: GithubTreeEntry[]
      truncated?: boolean
    }>(treeUrl, token)

    const candidateManifests = (treeResponse.tree ?? [])
      .filter(
        (entry) =>
          entry.type === 'blob' &&
          entry.path?.toLowerCase().endsWith('package.json') &&
          entry.path?.toLowerCase() !== 'package.json' &&
          !entry.path?.includes('/node_modules/'),
      )
      .sort((a, b) => (a.path || '').localeCompare(b.path || ''))
      .slice(0, maxFiles)

    const manifestDeps = await Promise.all(
      candidateManifests
        .filter((manifest): manifest is GithubTreeEntry & { sha: string } =>
          Boolean(manifest.sha),
        )
        .map(async (manifest) => {
          const content = await readBlobContent(
            repo.full_name,
            manifest.sha,
            token,
          )
          return parseDependencyNamesFromPackageJson(content)
        }),
    )

    for (const depsFromManifest of manifestDeps) {
      for (const dep of depsFromManifest) {
        deps.add(dep)
      }
    }

    return Array.from(deps)
  } catch {
    // Tree scans can fail for very large repos/rate limits; keep root deps.
    return Array.from(deps)
  }
}

async function readRepoToolingSignals(
  repo: GithubRepo,
  token: string,
): Promise<RepoToolingSignal[]> {
  const branch = repo.default_branch || 'main'
  const signals: RepoToolingSignal[] = []

  try {
    const rootTree = await fetchGithubJson<{
      tree?: GithubTreeEntry[]
    }>(
      `https://api.github.com/repos/${encodeRepoPath(repo.full_name)}/git/trees/${encodeURIComponent(branch)}`,
      token,
    )

    const rootFiles = new Set(
      (rootTree.tree ?? [])
        .filter((entry) => entry.type === 'blob')
        .map((entry) => (entry.path || '').toLowerCase()),
    )
    const rootDirs = new Set(
      (rootTree.tree ?? [])
        .filter((entry) => entry.type === 'tree')
        .map((entry) => (entry.path || '').toLowerCase()),
    )

    if (
      rootFiles.has('package-lock.json') ||
      rootFiles.has('npm-shrinkwrap.json')
    ) {
      signals.push({ key: 'npm', score: 2, reason: 'tooling-file' })
    }
    if (rootFiles.has('yarn.lock')) {
      signals.push({ key: 'yarn', score: 2, reason: 'tooling-file' })
    }
    if (rootFiles.has('pnpm-lock.yaml')) {
      signals.push({ key: 'pnpm', score: 2, reason: 'tooling-file' })
    }
    if (rootFiles.has('bun.lockb') || rootFiles.has('bun.lock')) {
      signals.push({ key: 'bun', score: 2, reason: 'tooling-file' })
    }
    if (
      rootFiles.has('playwright.config.ts') ||
      rootFiles.has('playwright.config.js') ||
      rootFiles.has('playwright.config.mjs') ||
      rootFiles.has('playwright.config.cjs')
    ) {
      signals.push({ key: 'playwright', score: 3, reason: 'tooling-file' })
    }
    const hasComponentsConfig = rootFiles.has('components.json')
    let hasShadcnDependency = false
    const rootManifest = (rootTree.tree ?? []).find(
      (entry) =>
        entry.type === 'blob' &&
        entry.path?.toLowerCase() === 'package.json' &&
        entry.sha,
    )
    if (rootManifest?.sha) {
      const rootManifestRaw = await readBlobContent(
        repo.full_name,
        rootManifest.sha,
        token,
      )
      const deps = parseDependencyNamesFromPackageJson(rootManifestRaw).map(
        (dep) => dep.toLowerCase(),
      )
      hasShadcnDependency = deps.some(
        (dep) =>
          dep.includes('shadcn') || dep === '@shadcn/ui' || dep === 'shadcn-ui',
      )
    }
    const hasComponentsDir = rootDirs.has('components')
    if (hasComponentsConfig && (hasShadcnDependency || hasComponentsDir)) {
      signals.push({ key: 'shadcn-ui', score: 2, reason: 'tooling-file' })
    }
  } catch {
    // Non-fatal; package/language signals still proceed.
  }

  return signals
}

/**
 * Collects weighted technology signals from the configured GitHub owner/org.
 *
 * Reads runtime config/env via `resolveConfig()` (owner/token/limits/filters),
 * then performs GitHub API scans across repos, languages, topics, manifests,
 * and selected tooling files to build scored `GithubTechSignal` entries.
 *
 * @returns Aggregated `GithubTechSignalsResult` including owner, scanned repo
 * count, sorted signal scores, and recoverable per-step error strings.
 * @throws Does not intentionally throw for expected config/network failures;
 * returns `{ ok: false, errors }` when config or repo listing fails. Some
 * unexpected low-level errors may still propagate from helpers.
 */
export async function collectGithubTechSignals(): Promise<GithubTechSignalsResult> {
  const config = resolveConfig()
  if (!config.ok) {
    return {
      ok: false,
      owner: 'unknown',
      scannedRepos: 0,
      signals: [],
      errors: [config.reason],
    }
  }

  const errors: string[] = []
  const signals = new Map<string, GithubTechSignal>()

  let repos: GithubRepo[] = []
  try {
    repos = await listRepos(config)
  } catch (error) {
    return {
      ok: false,
      owner: config.owner,
      scannedRepos: 0,
      signals: [],
      errors: [error instanceof Error ? error.message : String(error)],
    }
  }

  const included = repos.filter((repo) =>
    shouldIncludeRepo(
      repo,
      config.maxRepoAgeMonths,
      config.allowlist,
      config.denylist,
    ),
  )

  let debugPrinted = 0
  for (const repo of included) {
    const repoRef = repo.full_name

    if (repo.language) {
      trackSignal(signals, repo.language, 3, repoRef, 'primary-language')
    }

    for (const topic of repo.topics ?? []) {
      trackSignal(signals, topic, 2, repoRef, 'topic')
    }

    const languages = await readRepoLanguages(repo, config.token)
    for (const language of Object.keys(languages)) {
      trackSignal(signals, language, 1, repoRef, 'language-breakdown')
    }

    const packageDependencies = await readPackageJsonDependenciesFromManifests(
      repo,
      config.token,
      config.maxPackageJsonFilesPerRepo,
    )
    if (config.debugPackageScan && debugPrinted < 12) {
      console.log('[cms:tech-signals] package-scan', {
        repo: repo.full_name,
        packageDependencies: packageDependencies.length,
      })
      debugPrinted += 1
    }
    for (const dep of packageDependencies) {
      const signalKeys = expandDependencySignalKeys(dep)
      for (const key of signalKeys) {
        trackSignal(signals, key, 3, repoRef, 'package')
      }
    }

    const repoToolingSignals = await readRepoToolingSignals(repo, config.token)
    for (const toolingSignal of repoToolingSignals) {
      trackSignal(
        signals,
        toolingSignal.key,
        toolingSignal.score,
        repoRef,
        toolingSignal.reason,
      )
    }
  }

  return {
    ok: errors.length === 0,
    owner: config.owner,
    scannedRepos: included.length,
    signals: Array.from(signals.values()).sort((a, b) => b.score - a.score),
    errors,
  }
}

import {
  GithubHttpError,
  fetchGithubJson,
} from '@/lib/integrations/github/request'

import type { GithubRepoSource } from '@/lib/ai/githubRepos'

/**
 * Reading the public repositories of one GitHub account (#147).
 *
 * @remarks The only module in this feature that touches the network, and it is
 * separated from everything else precisely so the rest can be tested without
 * one. It is exercised here against recorded fixture responses through a
 * stubbed `fetch`; the LIVE call has not been made from this lane's
 * environment, where the egress proxy denies api.github.com.
 *
 * ## Only public repositories, twice over
 *
 * The listing endpoint is `/users/{owner}/repos`, not `/user/repos`. The
 * difference is the whole never-leak story on the fetch side: `/user/repos` is
 * "everything the AUTHENTICATED user can see" and takes a `visibility=public`
 * QUERY PARAMETER — a filter, on a superset, that a typo turns off. The
 * `/users/{owner}` form returns the account's public repositories and has no
 * spelling that returns a private one, whatever the token is. The safe default
 * comes from choosing the endpoint, not from remembering the parameter.
 *
 * `assertIndexableRepo` in `githubRepos.ts` then refuses a `private: true`
 * repo anyway, at normalization time. Belt and braces, on the one axis where a
 * mistake is a disclosure rather than a bug.
 *
 * ## Forks are excluded, archived repos are not
 *
 * A fork's README is somebody else's project text. Indexing it under "Brandon's
 * repositories" does not add coverage, it adds a grounding DEFECT: Corvus would
 * answer "what has Brandon built" with a description of a project he copied.
 * Archived repos are the opposite case — still his work, still worth answering
 * about — so they are indexed, and `repoHeader` marks them archived so an
 * answer can say so. #147's acceptance criterion says "every public repo"; this
 * is the one deliberate narrowing, recorded here and in `docs/AI.md`.
 */

/** The `User-Agent` this caller sends, distinct from the tech-signal scan's. */
export const CORVUS_GITHUB_USER_AGENT = 'bp-portfolio-corvus-repo-sync'

/** Repositories requested per listing page — GitHub's maximum. */
export const REPO_PAGE_SIZE = 100

/** Pages the listing will walk before refusing to go further. */
export const MAX_REPO_PAGES = 10

/** The owner whose public repositories are indexed. */
export const DEFAULT_GITHUB_OWNER = 'brandonperfetti'

/** The shape of `/users/{owner}/repos`, narrowed to the fields used. */
interface RepoListEntry {
  id?: number
  name?: string
  full_name?: string
  private?: boolean
  fork?: boolean
  archived?: boolean
  description?: string | null
  homepage?: string | null
  topics?: string[]
  language?: string | null
  languages_url?: string
  pushed_at?: string | null
  created_at?: string | null
}

/**
 * Which account to index, and which token to read it with.
 *
 * @remarks `CORVUS_GITHUB_OWNER` first so the sync can be pointed elsewhere
 * without disturbing the tech-signal scan's `GITHUB_OWNER`, which is a
 * different job with a different token lifecycle.
 *
 * @returns The owner login and the token, or a reason it cannot run.
 */
export function resolveRepoSyncConfig():
  { ok: true; owner: string; token: string } | { ok: false; reason: string } {
  const owner =
    process.env.CORVUS_GITHUB_OWNER?.trim() ||
    process.env.GITHUB_OWNER?.trim() ||
    DEFAULT_GITHUB_OWNER

  const token = process.env.GITHUB_TOKEN?.trim()
  if (!token) {
    return {
      ok: false,
      reason:
        'Missing GITHUB_TOKEN. Public-repo reads still need a token for a ' +
        'usable rate limit (60/hour unauthenticated vs 5000/hour with one).',
    }
  }

  return { ok: true, owner, token }
}

/** Repositories to skip by name, from `CORVUS_GITHUB_SYNC_DENYLIST`. */
export function repoDenylist(): Set<string> {
  const raw = process.env.CORVUS_GITHUB_SYNC_DENYLIST?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

/** What one listing walk produced, and whether it completed. */
export interface RepoListing {
  entries: RepoListEntry[]
  /**
   * Whether every page was read.
   *
   * @remarks Feeds `canSweepGithubRepos`. A listing that stopped early because
   * it hit {@link MAX_REPO_PAGES} is NOT complete: the sync would be deciding
   * that everything past page ten no longer exists.
   */
  complete: boolean
}

/**
 * Walk `/users/{owner}/repos` to the end.
 *
 * @remarks Errors are NOT caught here. A listing failure has to reach the
 * caller as a failure, because the alternative — returning what was read so
 * far — is precisely the partial read that would let the sweep empty the
 * index. The caller marks the run incomplete and skips the sweep.
 *
 * @param owner - The account login.
 * @param token - A GitHub token.
 * @returns The entries and whether the walk finished.
 */
export async function fetchPublicRepoListing(
  owner: string,
  token: string,
): Promise<RepoListing> {
  const entries: RepoListEntry[] = []

  for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
    const url =
      `https://api.github.com/users/${encodeURIComponent(owner)}/repos` +
      `?type=owner&sort=full_name&direction=asc&per_page=${REPO_PAGE_SIZE}&page=${page}`

    const chunk = await fetchGithubJson<RepoListEntry[]>(url, token, {
      userAgent: CORVUS_GITHUB_USER_AGENT,
    })

    if (!Array.isArray(chunk)) {
      throw new Error(
        `[corvus:github] repo listing page ${page} was not an array`,
      )
    }

    entries.push(...chunk)
    if (chunk.length < REPO_PAGE_SIZE) {
      return { entries, complete: true }
    }
  }

  return { entries, complete: false }
}

/**
 * Should this listing entry become a document?
 *
 * @param entry - One listing entry.
 * @param denylist - Lower-cased names and full names to skip.
 * @returns Whether to fetch and index it.
 */
export function shouldIndexRepo(
  entry: RepoListEntry,
  denylist: ReadonlySet<string>,
): boolean {
  if (entry.private === true) return false
  if (entry.fork === true) return false
  if (typeof entry.id !== 'number' || typeof entry.name !== 'string') {
    return false
  }
  const name = entry.name.toLowerCase()
  const fullName = (entry.full_name ?? '').toLowerCase()
  return !denylist.has(name) && !denylist.has(fullName)
}

/**
 * The root README as markdown, or `null` when the repo has none.
 *
 * @remarks A 404 is an ordinary answer here — plenty of repos have no README —
 * so it is turned into `null` rather than propagated. Every other status still
 * throws: a 403 is a rate limit or a permission problem and must not be
 * silently recorded as "this repo has no README", which would delete the
 * README half of an existing document on the next sync.
 *
 * GitHub returns the file base64-encoded with embedded newlines, which
 * `Buffer.from(..., 'base64')` handles. A non-base64 encoding (GitHub uses
 * `"none"` for files over 1MB, returning empty content) yields `null` rather
 * than garbage.
 *
 * @param fullName - `owner/name`.
 * @param token - A GitHub token.
 * @returns The README markdown, or `null`.
 */
export async function fetchRepoReadme(
  fullName: string,
  token: string,
): Promise<string | null> {
  const [owner = '', repo = ''] = fullName.split('/')
  const url =
    `https://api.github.com/repos/${encodeURIComponent(owner)}/` +
    `${encodeURIComponent(repo)}/readme`

  try {
    const body = await fetchGithubJson<{
      encoding?: string
      content?: string
    }>(url, token, { userAgent: CORVUS_GITHUB_USER_AGENT })

    if (body.encoding !== 'base64' || typeof body.content !== 'string') {
      return null
    }
    const text = Buffer.from(body.content, 'base64').toString('utf8')
    return text.trim() === '' ? null : text
  } catch (error) {
    if (error instanceof GithubHttpError && error.status === 404) return null
    throw error
  }
}

/**
 * The repo's language byte counts.
 *
 * @remarks Degrades to `{}` on a 404 for the same reason the README does — an
 * empty repository legitimately has no languages — and rethrows everything
 * else.
 *
 * @param languagesUrl - The `languages_url` from the listing entry.
 * @param token - A GitHub token.
 * @returns `{ language: bytes }`, possibly empty.
 */
export async function fetchRepoLanguages(
  languagesUrl: string | undefined,
  token: string,
): Promise<Record<string, number>> {
  if (!languagesUrl) return {}
  try {
    const body = await fetchGithubJson<Record<string, number>>(
      languagesUrl,
      token,
      { userAgent: CORVUS_GITHUB_USER_AGENT },
    )
    return body && typeof body === 'object' ? body : {}
  } catch (error) {
    if (error instanceof GithubHttpError && error.status === 404) return {}
    throw error
  }
}

/**
 * Turn one listing entry into a full {@link GithubRepoSource}.
 *
 * @remarks Two extra requests per repo (README, languages), which is what
 * bounds the cost of a run: roughly `1 + 2n` requests for `n` repos, so a
 * forty-repo account is about eighty calls against a 5,000/hour authenticated
 * limit. Sequential rather than parallel on purpose — a scheduled weekly job
 * has all the time it needs, and burst-parallel requests are how a token
 * discovers GitHub's secondary rate limits.
 *
 * @param entry - One listing entry.
 * @param token - A GitHub token.
 * @returns The repository, ready to chunk.
 */
export async function hydrateRepo(
  entry: RepoListEntry,
  token: string,
): Promise<GithubRepoSource> {
  const fullName = entry.full_name ?? entry.name ?? ''
  const [readme, languages] = [
    await fetchRepoReadme(fullName, token),
    await fetchRepoLanguages(entry.languages_url, token),
  ]

  return {
    id: entry.id as number,
    name: entry.name as string,
    fullName,
    isPrivate: entry.private === true,
    isFork: entry.fork === true,
    isArchived: entry.archived === true,
    description: entry.description ?? null,
    homepage: entry.homepage?.trim() ? entry.homepage.trim() : null,
    topics: Array.isArray(entry.topics) ? entry.topics : [],
    language: entry.language ?? null,
    languages,
    pushedAt: entry.pushed_at ?? null,
    createdAt: entry.created_at ?? null,
    readme,
  }
}

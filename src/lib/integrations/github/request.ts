import { setTimeout as sleep } from 'node:timers/promises'

/**
 * The one GitHub REST request layer this repo has (#147).
 *
 * @remarks Lifted VERBATIM out of `techSignals.ts`, where it had been the
 * private `fetchGithubJson` since the tech-signal scan was written. #147 needs
 * the same thing — an authenticated, timed-out, retrying JSON GET against
 * api.github.com — and the alternative was a second client with its own idea
 * of what a retryable status is. Two clients drifting apart is how one of them
 * quietly stops backing off on a 429 and gets the token rate-limited for
 * everything else.
 *
 * Nothing about the behaviour changed in the move: same timeout, same retry
 * count, same retryable-status set, same headers, same default `User-Agent`.
 * `techSignals.ts` imports it and its own test still passes unmodified, which
 * is the receipt that this was an extraction and not a rewrite.
 *
 * No `@octokit`. The whole surface either module needs is three GETs with a
 * bearer token; `fetch` covers it, and a dependency would be a permanent cost
 * for a one-time convenience.
 */

/** Wall-clock ceiling for a single GitHub request, in milliseconds. */
export const GITHUB_REQUEST_TIMEOUT_MS = 30_000

/** Attempts after the first before {@link fetchGithubJson} gives up. */
export const GITHUB_MAX_RETRIES = 3

/**
 * Statuses worth trying again.
 *
 * @remarks 429 is GitHub's rate limit and 5xx are its bad minutes; both pass.
 * 401/403/404 deliberately do NOT — a bad token, a denied resource and a
 * missing repo are all permanent for the duration of a run, and retrying them
 * three times turns one clear failure into four slow ones.
 */
export const GITHUB_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
])

/** The `User-Agent` the tech-signal scan has always sent. */
export const GITHUB_DEFAULT_USER_AGENT = 'bp-portfolio-tech-curation'

/** A non-2xx response from GitHub, carrying the status for the retry logic. */
export class GithubHttpError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'GithubHttpError'
    this.status = status
  }
}

/** Options for {@link fetchGithubJson}. */
export interface FetchGithubJsonOptions {
  /**
   * Overrides {@link GITHUB_DEFAULT_USER_AGENT}.
   *
   * @remarks Optional so `techSignals.ts` keeps sending exactly the string it
   * always did. The Corvus sync passes its own, because a rate-limit
   * investigation that cannot tell the two callers apart is not much of an
   * investigation.
   */
  userAgent?: string
}

/**
 * GET a GitHub REST endpoint as JSON, with a timeout and bounded retries.
 *
 * @param url - Absolute api.github.com URL.
 * @param token - A GitHub token; sent as `Authorization: Bearer`.
 * @param options - See {@link FetchGithubJsonOptions}.
 * @returns The parsed response body.
 * @throws {@link GithubHttpError} on a non-retryable or exhausted failure.
 */
export async function fetchGithubJson<T>(
  url: string,
  token: string,
  options: FetchGithubJsonOptions = {},
): Promise<T> {
  const userAgent = options.userAgent ?? GITHUB_DEFAULT_USER_AGENT

  for (let attempt = 0; attempt <= GITHUB_MAX_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      GITHUB_REQUEST_TIMEOUT_MS,
    )

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': userAgent,
        },
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!response.ok) {
        if (
          attempt < GITHUB_MAX_RETRIES &&
          GITHUB_RETRYABLE_STATUSES.has(response.status)
        ) {
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
      if (status !== undefined && !GITHUB_RETRYABLE_STATUSES.has(status)) {
        throw error
      }

      const retryableNetworkError =
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TypeError')

      if (attempt < GITHUB_MAX_RETRIES && retryableNetworkError) {
        await sleep((attempt + 1) * 500)
        continue
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Unreachable in normal flow: the retry loop either returns a parsed response
  // or throws after GITHUB_MAX_RETRIES with the timeout and backoff handling.
  // This is kept as a defensive terminal path for TypeScript control-flow.
  throw new Error(`GitHub request failed for ${url}`)
}

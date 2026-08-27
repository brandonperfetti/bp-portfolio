import { cacheLife, cacheTag } from 'next/cache'
import { draftMode } from 'next/headers'

import {
  coerceTechKey,
  collectGithubTechSignals,
} from '@/lib/integrations/github/techSignals'
import type { CmsEntityItem } from '@/lib/cms/types'

/** Serializable per-technology signal summary for the /tech visualization. */
export type TechSignalSummary = {
  /** Canonical signal key (see `coerceTechKey`). */
  key: string
  /** Weighted score across languages, topics, manifests, and tooling files. */
  score: number
  /** Distinct repos this technology appeared in. */
  repoCount: number
  /** De-duplicated evidence labels (`primary-language`, `package`, …). */
  reasons: string[]
  /** Score normalized to the strongest signal in the scan (0–1). */
  intensity: number
}

/** Cached, serializable result of the owner-wide GitHub scan. */
export type TechSignalsIndex = {
  ok: boolean
  owner: string
  scannedRepos: number
  generatedAt: string
  byKey: Record<string, TechSignalSummary>
}

// The tech-signals cache cadence (a 6h TTL) now lives in the `techSignals`
// cacheLife profile in next.config.mjs (#76 B1). No admin hook purges the
// `tech-signals` tag — the GitHub scan is external — so the TTL is the only
// freshness driver, exactly as before.

/**
 * Wall-clock cap on one owner-wide scan.
 *
 * Deliberately generous: a healthy cold scan is measured at ~15–17s (the whole
 * point of the 6h cache), so this is a circuit breaker for a stalled or
 * rate-limited GitHub — the per-request 30s timeout and 3 retries inside
 * `collectGithubTechSignals` otherwise compound across repos into minutes.
 * A "several seconds" cap would fire on every legitimate cold hit and, given
 * the caching semantics below, permanently blank the badges.
 */
const SCAN_TIMEOUT_MS = 25_000

/**
 * Resolves with the scan result, or `null` once `ms` elapses.
 *
 * @remarks The losing scan keeps running to completion in the background; its
 * result is discarded and its rejection pre-handled so a post-race failure
 * can't surface as an unhandled rejection.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  promise.catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Owner-wide GitHub tech signals, cached for six hours per deployment.
 *
 * Wraps `collectGithubTechSignals` (ported verbatim from v3) and converts its
 * `Set`-bearing entries into plain serializable objects so the result
 * survives `unstable_cache`'s JSON round-trip.
 *
 * @remarks A timeout returns `null` *inside* the cache scope, so the
 * badge-less result is cached for the full 6h window rather than re-running a
 * 25s scan on every subsequent request. This is deliberate and matches how
 * rate limits already degrade (`catch {}` → `null`): when GitHub is unwell,
 * one slow request per 6h is the price, and badges are cosmetic. Bypassing the
 * cache instead (by throwing) would leave a wedged GitHub able to charge every
 * visitor 25s — the failure this guard exists to prevent.
 *
 * @returns `null` when the scan is unconfigured (missing `GITHUB_OWNER` /
 * `GITHUB_TOKEN`), timed out, or produced no signals — pages render without
 * badges rather than failing. Scan errors degrade the same way.
 */
/**
 * Whether the owner-wide scan is configured to run at all.
 *
 * @remarks Both `GITHUB_OWNER` and `GITHUB_TOKEN` are required. This gate is
 * checked in the request-scoped wrapper ({@link getTechSignalsIndex}), *before*
 * the cache scope — an unauthenticated deployment (CI's production build carries
 * no token) then renders `/tech` from its fallback data immediately, never
 * entering `unstable_cache` and never touching the network. Reading env in the
 * request scope also keeps it reliable: like `draftMode()`, env reads *inside*
 * a cache scope are best avoided (see {@link getTechSignalsIndex}).
 */
function isTechScanConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OWNER?.trim() && process.env.GITHUB_TOKEN?.trim(),
  )
}

const getCachedTechSignalsIndex =
  async (): Promise<TechSignalsIndex | null> => {
    'use cache'
    cacheTag('tech-signals')
    cacheLife('techSignals')
    try {
      const result = await withTimeout(
        collectGithubTechSignals(),
        SCAN_TIMEOUT_MS,
      )
      if (!result?.signals.length) {
        return null
      }

      const maxScore = Math.max(...result.signals.map((s) => s.score), 1)
      const byKey: Record<string, TechSignalSummary> = {}
      for (const signal of result.signals) {
        byKey[signal.key] = {
          key: signal.key,
          score: signal.score,
          repoCount: signal.repos.size,
          reasons: signal.reasons,
          intensity: Math.min(1, signal.score / maxScore),
        }
      }

      return {
        ok: result.ok,
        owner: result.owner,
        scannedRepos: result.scannedRepos,
        generatedAt: new Date().toISOString(),
        byKey,
      }
    } catch {
      // Rate limits / network failures must never break /tech rendering.
      return null
    }
  }

/**
 * Request-scoped entry point for the cached scan.
 *
 * @remarks Draft mode (Payload admin live preview) opts the whole request out
 * of Next's data cache, so every draft-session request would re-run the live
 * owner-wide scan — measured at 15–17s server-side on `/tech` versus 0.4–1.1s
 * for comparable routes. Draft sessions therefore skip the scan entirely and
 * render without activity badges; the badges are a cosmetic overlay on CMS
 * content, and previewing CMS content is what draft mode is for. Anonymous
 * and production traffic is unaffected.
 *
 * The check has to live in this uncached wrapper rather than in the cached
 * callback: dynamic APIs read inside a cache scope are unreliable (in Next
 * 16.3 `draftMode()` there resolves against the enclosing store and can hand
 * back an empty draft mode), and by then the request has already entered the
 * scope that draft mode bypasses — i.e. already paid for the scan.
 *
 * @returns `null` in draft mode, otherwise the cached scan result (itself
 * `null` when unconfigured, timed out, or empty).
 */
export async function getTechSignalsIndex(): Promise<TechSignalsIndex | null> {
  const { isEnabled: draft } = await draftMode()
  if (draft) {
    return null
  }
  // Short-circuit an unconfigured scan here, outside the cache scope, so a
  // tokenless deployment renders `/tech` from its fallback without paying the
  // cache round-trip or risking the live scan (CI's production build has no
  // token — this is what keeps `/tech` fast there). Mirrors the draft skip.
  if (!isTechScanConfigured()) {
    return null
  }
  return getCachedTechSignalsIndex()
}

/**
 * Display-name → scan-key aliases the generic canonicalization can't derive.
 * Values ending in `/` are treated as key prefixes (scoped npm packages):
 * the best-scoring key under that prefix wins.
 */
const NAME_ALIASES: Record<string, string[]> = {
  'shadcn/ui': ['shadcn-ui'],
  'testing library': ['@testing-library/'],
  'fly.io': ['fly', 'flyio'],
  'mongodb atlas': ['mongodb'],
  'tanstack query': ['tanstack'],
}

/** Resolves one candidate (exact key, or `prefix/` pattern) against the index. */
function lookupCandidate(
  byKey: Record<string, TechSignalSummary>,
  candidate: string,
): TechSignalSummary | null {
  if (!candidate.endsWith('/')) {
    return byKey[candidate] ?? null
  }
  // Prefix pattern: best-scoring key under the scope (repoCount reads as
  // "at least N repos" — scoped packages usually co-occur per repo).
  let best: TechSignalSummary | null = null
  for (const key of Object.keys(byKey)) {
    if (key.startsWith(candidate) && (!best || byKey[key].score > best.score)) {
      best = byKey[key]
    }
  }
  return best
}

/**
 * Finds the signal summary for a CMS tech item.
 *
 * Match order: canonicalized display name (`coerceTechKey`), then the name
 * with slashes/dots collapsed to hyphens (`shadcn/ui` → `shadcn-ui`), then
 * explicit aliases (including scoped-package prefixes like
 * `@testing-library/`), then the `githubRepo` short name.
 *
 * @param index Cached scan output (or `null` when unconfigured).
 * @param item CMS tech row (name and optional `owner/name` repo hint).
 * @returns Matching summary, or `null` when the scan has no evidence.
 */
export function matchTechSignal(
  index: TechSignalsIndex | null,
  item: Pick<CmsEntityItem, 'name' | 'githubRepo'>,
): TechSignalSummary | null {
  if (!index) {
    return null
  }

  const lowerName = item.name.trim().toLowerCase()
  const candidates: string[] = [
    coerceTechKey(item.name),
    // Collapse separators the canonicalizer leaves in place.
    coerceTechKey(lowerName.replace(/[./]/g, '-')),
    ...(NAME_ALIASES[lowerName] ?? []),
  ]

  const repoShortName = item.githubRepo?.split('/')[1]?.trim()
  if (repoShortName) {
    candidates.push(coerceTechKey(repoShortName))
  }

  for (const candidate of candidates) {
    const match = lookupCandidate(index.byKey, candidate)
    if (match) {
      return match
    }
  }

  return null
}

/**
 * Builds the `signals` prop for `TechExplorer`: a slug-keyed map of summaries
 * for exactly the items that have scan evidence.
 */
export function buildSignalsBySlug(
  index: TechSignalsIndex | null,
  items: CmsEntityItem[],
): Record<string, TechSignalSummary> {
  const bySlug: Record<string, TechSignalSummary> = {}
  if (!index) {
    return bySlug
  }
  for (const item of items) {
    const signal = matchTechSignal(index, item)
    if (signal) {
      bySlug[item.slug] = signal
    }
  }
  return bySlug
}

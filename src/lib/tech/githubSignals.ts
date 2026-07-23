import { unstable_cache } from 'next/cache'

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

const SIGNALS_REVALIDATE_SECONDS = 6 * 60 * 60

/**
 * Owner-wide GitHub tech signals, cached for six hours per deployment.
 *
 * Wraps `collectGithubTechSignals` (ported verbatim from v3) and converts its
 * `Set`-bearing entries into plain serializable objects so the result
 * survives `unstable_cache`'s JSON round-trip.
 *
 * @returns `null` when the scan is unconfigured (missing `GITHUB_OWNER` /
 * `GITHUB_TOKEN`) or produced no signals — pages render without badges rather
 * than failing. Scan errors degrade the same way.
 */
export const getTechSignalsIndex = unstable_cache(
  async (): Promise<TechSignalsIndex | null> => {
    if (
      !process.env.GITHUB_OWNER?.trim() ||
      !process.env.GITHUB_TOKEN?.trim()
    ) {
      return null
    }

    try {
      const result = await collectGithubTechSignals()
      if (!result.signals.length) {
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
  },
  ['github-tech-signals'],
  { revalidate: SIGNALS_REVALIDATE_SECONDS, tags: ['tech-signals'] },
)

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

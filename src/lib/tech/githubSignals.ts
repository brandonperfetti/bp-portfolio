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
 * Finds the signal summary for a CMS tech item, trying the canonicalized
 * display name first, then the repo short name from `githubRepo`.
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

  const byName = index.byKey[coerceTechKey(item.name)]
  if (byName) {
    return byName
  }

  const repoShortName = item.githubRepo?.split('/')[1]?.trim()
  if (repoShortName) {
    return index.byKey[coerceTechKey(repoShortName)] ?? null
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

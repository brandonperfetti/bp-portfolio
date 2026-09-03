import { getPayload } from 'payload'

import config from '../src/payload.config'
import { getEmbeddingModelId } from '../src/lib/ai/embeddings'
import type { CorvusEmbeddingsDb } from '../src/lib/ai/embeddingsStore'
import {
  UnindexableRepoError,
  type GithubRepoSource,
} from '../src/lib/ai/githubRepos'
import {
  fetchPublicRepoListing,
  hydrateRepo,
  repoDenylist,
  resolveRepoSyncConfig,
  shouldIndexRepo,
} from '../src/lib/ai/githubReposFetch'
import {
  canSweepGithubRepos,
  deleteGithubRepoDocuments,
  readIndexedRepoDocIds,
  staleRepoDocIds,
  syncGithubRepoEmbeddings,
} from '../src/lib/ai/githubReposSync'

/**
 * Index every public `brandonperfetti` repository into `corvus_embeddings` (#147).
 *
 * @remarks The trigger for the `github-repos` collection, and the whole reason
 * #147 is a sync job rather than a tool call: repo content enters the prompt
 * only after it has been fetched, normalized and stored by a run somebody can
 * inspect. Nothing on the chat request path changes, and nothing on it makes a
 * network call it did not already make.
 *
 * Shaped after `backfill-corvus-embeddings.ts` — same `payload run` entry
 * point, same `payload.db.drizzle` handle, same counts line at the end for the
 * workflow's job summary — with one deliberate inversion.
 *
 * ## The sweep runs by DEFAULT here, and that is the point
 *
 * The backfill's `--drop-orphans` is opt-in because a stale CMS row is merely
 * stale. A stale `github-repos` row is a repository that has gone PRIVATE or
 * been deleted while its README stays retrievable by anonymous chat turns. On
 * this collection, not sweeping is the failure. So the polarity is inverted:
 * the sweep runs unless `--no-prune` is passed, and it is guarded instead of
 * gated — `canSweepGithubRepos` refuses an incomplete listing, an empty one,
 * and a run in which nothing was accounted for, which are the three ways a bad
 * read could otherwise empty the index.
 *
 * One further guard lives here rather than in the guard function, because it
 * depends on how this loop is written: a repo is added to `accountedFor` when
 * it is LISTED and indexable, not when it successfully embeds. A repo whose
 * README fetch 403s in the middle of a run is a failure to record and retry —
 * it is not evidence that the repository disappeared, and treating it as such
 * would delete a live repo's rows over a transient rate limit.
 *
 * Usage:
 *   pnpm corvus:sync-github
 *   pnpm corvus:sync-github -- --no-prune
 *   pnpm corvus:sync-github -- --dry-run
 *   payload run scripts/sync-github-repos.ts -- --dry-run
 *
 * The `--` is load-bearing, for the reason the backfill's docblock records:
 * `payload run` parses its own argv with minimist and rebuilds the script's
 * `process.argv` from the POSITIONAL arguments only, so a bare `--no-prune` is
 * consumed as an option to `payload` and never reaches the check below.
 * (Through the pnpm script the single `--` is enough: pnpm forwards it verbatim
 * to `payload run`.)
 *
 * Environment (names only — this repo is public):
 *   GITHUB_TOKEN              read-only; public-repo reads need it for the
 *                             5000/hour authenticated rate limit
 *   CORVUS_GITHUB_OWNER       optional; defaults to `brandonperfetti`
 *   CORVUS_GITHUB_SYNC_DENYLIST  optional comma-separated repo names to skip
 *   DATABASE_URI, OPENAI_API_KEY, PAYLOAD_SECRET  as the backfill uses them
 */
const noPrune = process.argv.includes('--no-prune')
const dryRun = process.argv.includes('--dry-run')

type Totals = {
  listed: number
  indexable: number
  written: number
  skipped: number
  metadataUpdated: number
  deleted: number
  failed: number
}

async function run(): Promise<void> {
  const payload = await getPayload({ config })
  const db = payload.db.drizzle as unknown as CorvusEmbeddingsDb

  const settings = resolveRepoSyncConfig()
  if (!settings.ok) {
    throw new Error(`[corvus:github] ${settings.reason}`)
  }

  const totals: Totals = {
    listed: 0,
    indexable: 0,
    written: 0,
    skipped: 0,
    metadataUpdated: 0,
    deleted: 0,
    failed: 0,
  }

  payload.logger.info(
    `[corvus:github] starting for ${settings.owner} with embedding model ` +
      `${getEmbeddingModelId()}${dryRun ? ' (DRY RUN — no writes)' : ''}`,
  )

  // A listing failure THROWS out of here rather than returning a short list.
  // That is the difference between a run that fails loudly and a run that
  // decides everything it could not read no longer exists.
  let listingComplete = false
  let entries: Awaited<ReturnType<typeof fetchPublicRepoListing>>['entries'] =
    []
  try {
    const listing = await fetchPublicRepoListing(settings.owner, settings.token)
    entries = listing.entries
    listingComplete = listing.complete
  } catch (error) {
    throw new Error(
      `[corvus:github] repo listing failed; refusing to continue because a ` +
        `partial listing cannot be told apart from repositories that were ` +
        `removed: ${String(error)}`,
    )
  }

  totals.listed = entries.length
  const denylist = repoDenylist()
  const indexable = entries.filter((entry) => shouldIndexRepo(entry, denylist))
  totals.indexable = indexable.length

  /**
   * Repos this run positively accounted for.
   *
   * @remarks Populated on LISTING, not on success — see the docblock above.
   */
  const accountedFor: number[] = []

  for (const entry of indexable) {
    const label = entry.full_name ?? entry.name ?? String(entry.id)
    accountedFor.push(entry.id as number)

    try {
      const repo: GithubRepoSource = await hydrateRepo(entry, settings.token)

      if (dryRun) {
        payload.logger.info(
          `[corvus:github] would index ${repo.fullName} ` +
            `(readme: ${repo.readme ? 'yes' : 'none'})`,
        )
        continue
      }

      const outcome = await syncGithubRepoEmbeddings({ db, repo })
      totals.written += outcome.written
      totals.metadataUpdated += outcome.metadataUpdated
      totals.deleted += outcome.deleted
      if (outcome.skipped) totals.skipped += 1
    } catch (error) {
      totals.failed += 1
      // An unindexable repo is a refusal, not a fault — log it at warn so a
      // private repo appearing in a public listing is visible without being
      // buried among genuine errors.
      const level = error instanceof UnindexableRepoError ? 'warn' : 'error'
      payload.logger[level](`[corvus:github] ${label} failed: ${String(error)}`)
    }
  }

  if (dryRun) {
    payload.logger.info('[corvus:github] dry run — skipping the prune sweep')
  } else if (noPrune) {
    payload.logger.warn(
      '[corvus:github] --no-prune: a repository made private or deleted will ' +
        'REMAIN retrievable until a run without this flag.',
    )
  } else {
    const { sweep, reason } = canSweepGithubRepos(
      totals.listed,
      accountedFor.length,
      listingComplete,
    )

    if (!sweep) {
      payload.logger.warn(
        `[corvus:github] SKIPPING the prune sweep (${reason}) — this run ` +
          `cannot tell a repository that was removed from one it failed to ` +
          `read. Re-run once the listing reads completely.`,
      )
    } else {
      const indexed = await readIndexedRepoDocIds(db)
      const stale = staleRepoDocIds(indexed, accountedFor)
      const removed = await deleteGithubRepoDocuments(db, stale)
      totals.deleted += removed
      if (removed > 0) {
        payload.logger.info(
          `[corvus:github] pruned ${removed} repository document(s) that are ` +
            `no longer public: doc_id ${stale.join(', ')}`,
        )
      }
    }
  }

  payload.logger.info(
    `[corvus:github] done: listed=${totals.listed} indexable=${totals.indexable} ` +
      `written=${totals.written} metadataUpdated=${totals.metadataUpdated} ` +
      `skippedRepos=${totals.skipped} deleted=${totals.deleted} ` +
      `failed=${totals.failed}`,
  )

  if (totals.failed > 0) {
    throw new Error(
      `[corvus:github] ${totals.failed} repository/repositories failed to sync`,
    )
  }
}

// `payload run` kills floating promises after module evaluation — top-level
// await is required (same lesson as the backfill and the e2e seed).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error('[corvus:github] fatal:', err)
  process.exit(1)
}

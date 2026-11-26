import { createHash } from 'node:crypto'

import {
  CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION,
  type CorvusChunk,
  hashChunkContent,
} from '@/lib/ai/chunking'

/**
 * Private repositories Corvus may describe at a high level (#193).
 *
 * @remarks **The rule is enforced at ingestion, not in the prompt.** Retrieval
 * quotes stored chunks into an anonymous chat, and a private README or issue
 * collects internal URLs, client names and occasionally secrets. So nothing
 * from a private repository is ever fetched: every value a summary row holds
 * is written HERE, by Brandon, in a reviewed pull request. Corvus cannot leak
 * what was never stored, and the sync cannot store what it never read.
 *
 * That is also why no GitHub token is involved. The public sync's credential
 * reads public repositories only (`.github/workflows/corvus-github-sync.yml`);
 * reading private metadata would need a wider one, and the four fields below
 * are short enough that the owner writing them is both safer and simpler than
 * granting it.
 */
export interface PrivateRepoSummary {
  /**
   * The repository's short name, e.g. `claude-skills`. No owner, no slash:
   * the name is a label here, never the start of a URL.
   */
  name: string
  /** One line saying what the repository is. */
  description: string
  /** A few topic words, as GitHub topics are. */
  topics: readonly string[]
  /**
   * What the repository is for and where it is headed, in Brandon's words,
   * written for the public. This is the story; the other fields are its frame.
   */
  blurb: string
  /**
   * Where the blurb lives publicly on this site — an article, a project page —
   * as a site path (`/articles/…`), or `null`/absent for none.
   *
   * @remarks Never a GitHub URL: a visitor cannot open a private repository,
   * so citing one is a broken promise, and naming its address is the start of
   * a leak. {@link assertPublishableSummary} refuses anything but a site path.
   */
  publicUrl?: string | null
}

/**
 * The allowlist. **Empty by default, and that is the point.**
 *
 * @remarks Adding a repository is a deliberate act with a reviewer: an entry
 * here, in a pull request, with every word that will reach the index visible
 * in the diff. There is no wildcard, no pattern and no "all private repos"
 * switch, and there must never be one. `docs/AI.md` § Private repositories
 * has the workflow.
 */
export const PRIVATE_REPO_SUMMARIES: readonly PrivateRepoSummary[] = []

/** The fields a summary row is built from, and the only ones it can contain. */
export const PRIVATE_SUMMARY_FIELDS = [
  'name',
  'description',
  'topics',
  'blurb',
] as const

/** The sentence every summary row ends with, so the passage says its own limit. */
export const PRIVATE_SUMMARY_NOTICE =
  'This repository is private. Only this summary is public: its code, files and README are not part of this site, and Corvus has never read them.'

/** A summary entry that must not be indexed. */
export class UnpublishableSummaryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnpublishableSummaryError'
  }
}

/** Any URL, or a bare GitHub address, inside a free-text field. */
// No word boundary before the scheme: `_https://…_` (Markdown emphasis) has a
// word character in front of it (#193 review).
const URL_LIKE = /(?:https?:\/\/|www\.)\S+|github\.com\b/i

/** A stand-in origin: only whether a path stays on it matters. */
const SITE_ORIGIN = 'https://site.invalid'

/**
 * Is `value` a path on this site, as a browser would resolve it?
 *
 * @remarks A leading-slash regex is not enough (#193 review): browsers read
 * a backslash as a slash, so `/\github.com/owner/repo` resolves to
 * GitHub. The value must start with exactly one `/`, carry no backslash,
 * whitespace or control character, and still resolve to the site's own
 * origin under WHATWG URL parsing.
 *
 * @param value - The candidate `publicUrl`.
 * @returns `true` only for a same-origin site path.
 */
function isSitePath(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (!/^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(value)) return false
  try {
    return new URL(value, SITE_ORIGIN).origin === SITE_ORIGIN
  } catch {
    return false
  }
}

/**
 * Refuse an entry that could put more than its summary into the index.
 *
 * @remarks Runs inside {@link chunkPrivateRepoSummary}, so no path to a row
 * can skip it. Each check is a way the "summary only" promise could break
 * through a typo rather than a decision:
 *
 * - a `name` with an owner or a slash could be assembled into a GitHub URL;
 * - a URL inside `description`, `topics` or `blurb` is an address the prompt
 *   would hand the model to repeat — a private GitHub one is the exact leak
 *   #193 rules out, and any other belongs in `publicUrl`, where it is checked;
 * - a `publicUrl` that is not a site path could cite GitHub or anywhere else;
 * - an empty `blurb` is a row with no story, which is a row with no reason to
 *   exist.
 *
 * @param entry - An allowlist entry.
 * @throws {@link UnpublishableSummaryError} naming what was refused.
 */
export function assertPublishableSummary(entry: PrivateRepoSummary): void {
  const name = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (!/^[\w.-]+$/.test(name)) {
    throw new UnpublishableSummaryError(
      `[corvus:private] refusing summary "${String(entry.name)}": the name ` +
        `must be the bare repository name, with no owner, slash or space.`,
    )
  }
  const texts = [entry.description, entry.blurb, ...(entry.topics ?? [])]
  if (texts.some((text) => typeof text === 'string' && URL_LIKE.test(text))) {
    throw new UnpublishableSummaryError(
      `[corvus:private] refusing summary "${name}": a URL or github.com ` +
        `address appears in its text. Put a public site path in publicUrl.`,
    )
  }
  if (typeof entry.blurb !== 'string' || !entry.blurb.trim()) {
    throw new UnpublishableSummaryError(
      `[corvus:private] refusing summary "${name}": it has no blurb.`,
    )
  }
  const url = entry.publicUrl
  if (url !== undefined && url !== null && !isSitePath(url)) {
    throw new UnpublishableSummaryError(
      `[corvus:private] refusing summary "${name}": publicUrl must be a path ` +
        `on this site (starting with a single "/"), never a GitHub or ` +
        `external address.`,
    )
  }
}

/**
 * The summary's `doc_id`: a stable positive `int4` from its name.
 *
 * @remarks A private repository has no id here — nothing asks GitHub for
 * one — so the id is derived from the name: the first 31 bits of its SHA-256,
 * never zero. The same name always maps to the same row, so editing a blurb
 * updates in place, and the collection is its own namespace, so a collision
 * with a public repository's GitHub id is impossible by construction.
 *
 * @param name - The repository name.
 * @returns An integer in `[1, 2^31 - 1]`.
 */
export function privateRepoSummaryDocId(name: string): number {
  const digest = createHash('sha256').update(name.trim()).digest()
  return digest.readUInt32BE(0) & 0x7fffffff || 1
}

/**
 * The one chunk an allowlisted private repository contributes.
 *
 * @remarks Built field by field from {@link PRIVATE_SUMMARY_FIELDS}, never by
 * spreading the entry, so an object that happens to carry a `readme`, a code
 * excerpt or anything else contributes none of it — the test that matters
 * (#193's first AC) hands it exactly such an object.
 *
 * The passage labels itself private twice — in the title and in
 * {@link PRIVATE_SUMMARY_NOTICE} — so the prompt rule that keeps answers
 * high-level has a marker to key on even when the passage is quoted on its
 * own.
 *
 * @param entry - An allowlist entry.
 * @returns The chunk, `visibility: 'public'` because every word in it is.
 * @throws {@link UnpublishableSummaryError} via {@link assertPublishableSummary}.
 */
export function chunkPrivateRepoSummary(
  entry: PrivateRepoSummary,
): CorvusChunk {
  assertPublishableSummary(entry)
  const name = entry.name.trim()
  const topics = (entry.topics ?? [])
    .map((topic) => topic.trim())
    .filter(Boolean)
  const content = [
    `Private repository: ${name}`,
    entry.description.trim() ? `Description: ${entry.description.trim()}` : '',
    topics.length ? `Topics: ${topics.join(', ')}` : '',
    `About: ${entry.blurb.trim()}`,
    PRIVATE_SUMMARY_NOTICE,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    collection: CORVUS_PRIVATE_REPO_SUMMARY_COLLECTION,
    docId: privateRepoSummaryDocId(name),
    chunkIndex: 0,
    title: `${name} (private repository)`,
    content,
    contentHash: hashChunkContent(content),
    sourceUrl: entry.publicUrl ?? null,
    visibility: 'public',
    publishedAt: null,
  }
}

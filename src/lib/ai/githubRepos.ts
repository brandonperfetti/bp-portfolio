import {
  CHUNK_OVERLAP_TOKENS,
  CORVUS_GITHUB_REPOS_COLLECTION,
  type CorvusChunk,
  MAX_CHUNK_TOKENS,
  TARGET_CHUNK_TOKENS,
  estimateTokens,
  hashChunkContent,
  sourceUrlFor,
  takeTailTokens,
} from '@/lib/ai/chunking'

/**
 * Turning one public GitHub repository into `corvus_embeddings` rows (#147).
 *
 * @remarks Pure. Nothing in this module touches the network or the database —
 * `githubReposFetch.ts` does the first and `githubReposSync.ts` the second —
 * which is what lets every normalization rule below be tested against recorded
 * fixtures at zero cost and with no live GitHub.
 *
 * The shape mirrors `chunking.ts` deliberately: same token budgets, same
 * overlap, same `hashChunkContent`, same `CorvusChunk` output. A repo document
 * is a labelled header (name, description, topics, languages, homepage) plus
 * the README rendered down to text, chunked on the same boundaries an article
 * is. Reusing the constants rather than copying them means a future retune of
 * `TARGET_CHUNK_TOKENS` moves both corpora together instead of quietly
 * splitting the index into two chunk sizes.
 */

/** The metadata + README of one repository, already fetched. */
export interface GithubRepoSource {
  /** GitHub's numeric repository id — the row's `doc_id`. */
  id: number
  /** Short name, e.g. `bp-portfolio`. */
  name: string
  /** `owner/name`, e.g. `brandonperfetti/bp-portfolio`. */
  fullName: string
  /** GitHub's own `private` flag, as returned. Never-leak's input. */
  isPrivate: boolean
  /** Whether the repo is a fork of someone else's project. */
  isFork: boolean
  /** Whether GitHub marks the repo archived. */
  isArchived: boolean
  description: string | null
  homepage: string | null
  topics: string[]
  /** The repo's dominant language, as GitHub computes it. */
  language: string | null
  /** `{ TypeScript: 91234, CSS: 512 }` — bytes per language. */
  languages: Record<string, number>
  /** ISO timestamp of the last push. */
  pushedAt: string | null
  /** ISO timestamp of creation. */
  createdAt: string | null
  /** The root README as markdown, or `null` when the repo has none. */
  readme: string | null
}

/**
 * Postgres `int4` bounds — `corvus_embeddings.doc_id` is an `integer`.
 *
 * @remarks Named rather than inlined because it is a real, dated constraint
 * and not a defensive nicety. The column was declared `integer` for Payload
 * document ids, which are a sequence starting at 1; a GitHub repository id is
 * a global counter that sat around 1.0e9 when this was written, so today's
 * ids fit with roughly half the range to spare. When GitHub crosses
 * 2,147,483,647 this module starts refusing repos with a named error instead
 * of handing Postgres a value it will reject as an opaque driver fault
 * mid-sync — and the fix at that point is a migration widening the column to
 * `bigint`, which is a decision for whoever is there, not a silent truncation
 * here.
 */
export const MAX_DOC_ID = 2_147_483_647

/**
 * A repo GitHub returned that must not be indexed.
 *
 * @remarks Its own class so the sync can log the reason per repo and keep
 * going, rather than either aborting the run or swallowing the skip.
 */
export class UnindexableRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnindexableRepoError'
  }
}

/**
 * Refuse anything that is not a public, indexable repository.
 *
 * @remarks The second half of the never-leak bar, and the half that does not
 * depend on the listing endpoint behaving. `fetchPublicRepos` asks
 * `/users/{owner}/repos`, which by construction returns only public
 * repositories — but "by construction" is a claim about GitHub, made by this
 * code, about a response this code did not write. If that endpoint ever
 * returns a private repo (a token scope change, an API change, a
 * misconfiguration that points the sync at `/user/repos`), the difference
 * between a bug and a leak is this function.
 *
 * It runs at NORMALIZATION time rather than at fetch time on purpose: every
 * path that can produce a `github-repos` chunk goes through
 * {@link chunkGithubRepo}, so the guard cannot be bypassed by a future caller
 * that fetches differently.
 *
 * @param repo - A repository as fetched.
 * @throws {@link UnindexableRepoError} when the repo is private or its id
 * cannot be stored.
 */
export function assertIndexableRepo(repo: GithubRepoSource): void {
  if (repo.isPrivate) {
    throw new UnindexableRepoError(
      `[corvus:github] refusing to index ${repo.fullName}: the API reported it ` +
        `as PRIVATE. The chat widget is anonymous-reachable; private repo ` +
        `content must never enter the retrieval index.`,
    )
  }
  if (!Number.isInteger(repo.id) || repo.id <= 0 || repo.id > MAX_DOC_ID) {
    throw new UnindexableRepoError(
      `[corvus:github] refusing to index ${repo.fullName}: repository id ` +
        `${repo.id} is not a positive integer within corvus_embeddings.doc_id's ` +
        `int4 range (max ${MAX_DOC_ID}). Widening that column is a migration.`,
    )
  }
}

/** Fenced code blocks, in either fence style. */
const FENCED_CODE = /^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[ \t]*$/gm

/** An image, including the badge-in-a-link form `[![alt](img)](href)`. */
const LINKED_IMAGE = /\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g

/** A bare image. */
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g

/** An inline link — the text survives, the target does not. */
const INLINE_LINK = /\[([^\]]*)\]\([^)]*\)/g

/** A reference-style link definition line. */
const LINK_DEFINITION = /^\s*\[[^\]]+\]:\s*\S+.*$/gm

/** An HTML comment, which READMEs use for tooling directives. */
const HTML_COMMENT = /<!--[\s\S]*?-->/g

/** Any HTML tag. READMEs routinely open with a `<p align="center">` block. */
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g

/** Leading heading hashes, list bullets, blockquote marks and table pipes. */
const BLOCK_MARKER = /^[ \t]*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?|\|)/gm

/** A setext underline or a horizontal rule made of repeated punctuation. */
const RULE_LINE = /^[ \t]*(?:[-=]{3,}|\*{3,}|_{3,})[ \t]*$/gm

/** Emphasis, inline-code backticks and strikethrough markers. */
const INLINE_MARKER = /[*_`~]+/g

/**
 * Render a README's markdown down to plain text.
 *
 * @remarks Zero dependencies, and that is a decision rather than an oversight.
 * The repo installs `react-markdown` + `remark-gfm`, but both are React
 * RENDERERS — reaching a markdown AST from a Node script would mean depending
 * on `unified`/`mdast-util-from-markdown` transitively, which pnpm's strict
 * layout does not expose and which #147 is not allowed to add. The other
 * option was `flattenBlockText`, which the article chunker uses — but that
 * takes Lexical nodes, and a README is markdown, so it does not apply.
 *
 * What the substitution costs is honest to state: this is a stripper, not a
 * parser, so a pathological README (markdown nested inside HTML inside a
 * table) degrades to slightly noisier text. What it must not do — and what the
 * ordering below is about — is emit a URL that was only ever a link target.
 * Corvus is told never to write a URL it was not given, and the `Source:` line
 * is where URLs are supposed to come from; leaving raw hrefs in the passage
 * body recreates exactly the vendor-URL competition that
 * `groundedSystem.ts` documents at length. So images, badges and link targets
 * are removed while the link TEXT is kept, because the text is the fact.
 *
 * Order is load-bearing: fenced code first (so a fence's contents cannot be
 * mistaken for markup), then the image forms outermost-first (a badge is a
 * link wrapping an image, and stripping the image first would leave a bare
 * `[](href)` behind), then links, then HTML, then block markers.
 *
 * @param markdown - Raw README markdown, or nullish.
 * @returns Plain text with blank-line paragraph separation, or `''`.
 */
export function markdownToText(markdown: string | null | undefined): string {
  if (!markdown) return ''

  return markdown
    .replace(FENCED_CODE, ' ')
    .replace(HTML_COMMENT, ' ')
    .replace(LINKED_IMAGE, ' ')
    .replace(IMAGE, ' ')
    .replace(LINK_DEFINITION, ' ')
    .replace(INLINE_LINK, '$1')
    .replace(HTML_TAG, ' ')
    .replace(RULE_LINE, ' ')
    .replace(BLOCK_MARKER, '')
    .replace(INLINE_MARKER, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The languages a repo uses, largest first, as a readable list.
 *
 * @remarks GitHub reports bytes per language, and bytes are not a fact anyone
 * asks Corvus about — "what is this built with" wants names, in the order that
 * says which one dominates. Ties break alphabetically so the rendered text is
 * stable across syncs; an unstable ordering would change `content_hash` on
 * every run and defeat the no-op skip this whole design rests on.
 *
 * @param languages - GitHub's `{ language: bytes }` map.
 * @returns Language names, most bytes first.
 */
export function orderedLanguages(languages: Record<string, number>): string[] {
  return Object.entries(languages)
    .filter(([name, bytes]) => name.trim() !== '' && Number.isFinite(bytes))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
}

/**
 * The timestamp a repo row carries in `published_at`.
 *
 * @remarks **`pushed_at`, falling back to `created_at`, falling back to
 * `null`** — and the choice matters because retrieval filters on this column
 * (`published_at IS NULL OR published_at <= now()`).
 *
 * `pushed_at` is the right value for two reasons. It is always in the past, so
 * it can never accidentally embargo a repo the way a future-dated post is
 * embargoed — a repo has no publication schedule to honour, and inventing one
 * would be a way to hide repos by accident. And it is the freshness signal a
 * reader would want if it is ever surfaced: "last pushed" is what a
 * repository's recency means.
 *
 * `null` is the honest last resort rather than `now()`: `NULL` means "not a
 * scheduled thing" in this schema and stays retrievable, which is the correct
 * behaviour for a repo whose timestamps came back malformed. Writing `now()`
 * would fabricate a fact.
 *
 * @param repo - A repository as fetched.
 * @returns An ISO timestamp, or `null`.
 */
export function repoPublishedAt(repo: GithubRepoSource): string | null {
  for (const value of [repo.pushedAt, repo.createdAt]) {
    if (typeof value !== 'string' || value.trim() === '') continue
    const time = Date.parse(value)
    if (Number.isFinite(time)) return new Date(time).toISOString()
  }
  return null
}

/** Render one `"Field: value"` line, or `null` when there is nothing to say. */
const label = (
  name: string,
  value: string | null | undefined,
): string | null => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? `${name}: ${text}` : null
}

/**
 * The labelled header every chunk of a repo document is prefixed with.
 *
 * @remarks Same reasoning as `chunkPost`'s title/excerpt prefix: a passage
 * lifted out of the middle of a long README says "the third approach" and is
 * unusable as grounding unless it also says which repository it is from. The
 * `Repository:` line carries the `owner/name`, which is what a citation and an
 * answer both need.
 *
 * `Archived:` appears only when true. A repo that is archived is still
 * Brandon's work and still worth answering about, but an answer that presents
 * a dormant 2021 experiment as current work is wrong in a way the corpus can
 * cheaply prevent.
 *
 * @param repo - A repository as fetched.
 * @returns The header text.
 */
export function repoHeader(repo: GithubRepoSource): string {
  const languages = orderedLanguages(repo.languages)
  return [
    label('Repository', repo.fullName),
    label('Name', repo.name),
    label('Description', repo.description),
    label('Topics', repo.topics.filter(Boolean).join(', ')),
    label('Primary language', repo.language),
    label('Languages', languages.join(', ')),
    label('Homepage', repo.homepage),
    repo.isArchived
      ? 'Archived: this repository is no longer maintained'
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Chunk one repository into rows destined for `corvus_embeddings`.
 *
 * @remarks One DOCUMENT per repo — which is one row when the README is short
 * and several when it is not, exactly as an article is. The `doc_id` is
 * GitHub's repository id, which makes the `(collection, doc_id, chunk_index)`
 * upsert key stable across renames: a repo renamed from `foo` to `bar` updates
 * its rows in place instead of leaving a ghost `foo` document behind that only
 * the never-leak sweep would eventually collect.
 *
 * A repo with no README and no description still yields ONE header-only chunk,
 * so "does Brandon have a repo called X" is answerable. A repo with nothing at
 * all — no name, no anything — yields none.
 *
 * `visibility` is the literal `'public'` rather than a computed value, because
 * {@link assertIndexableRepo} has already refused every other case: there is no
 * such thing as a `'gated'` repo row, and computing one would imply otherwise.
 *
 * @param repo - A repository as fetched.
 * @returns Ordered chunks, `chunkIndex` starting at 0.
 * @throws {@link UnindexableRepoError} via {@link assertIndexableRepo}.
 */
export function chunkGithubRepo(repo: GithubRepoSource): CorvusChunk[] {
  assertIndexableRepo(repo)

  const header = repoHeader(repo)
  const readme = markdownToText(repo.readme)

  const segments = readme
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const bodies: string[] = []
  let current: string[] = []
  let tokens = 0
  let overlap = ''

  const flush = () => {
    if (!current.length) return
    const body = current.join('\n')
    bodies.push(body)
    overlap = takeTailTokens(body, CHUNK_OVERLAP_TOKENS)
    current = []
    tokens = 0
  }

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment)
    if (current.length && tokens + segmentTokens > MAX_CHUNK_TOKENS) {
      flush()
    }
    if (!current.length && overlap) {
      current.push(overlap)
      tokens = estimateTokens(overlap)
    }
    current.push(segment)
    tokens += segmentTokens
    if (tokens >= TARGET_CHUNK_TOKENS) {
      flush()
    }
  }
  flush()

  if (!bodies.length) {
    if (!header) return []
    bodies.push('')
  }

  const sourceUrl = sourceUrlFor(CORVUS_GITHUB_REPOS_COLLECTION, repo.fullName)
  const publishedAt = repoPublishedAt(repo)

  return bodies.map((body, index) => {
    const content = header && body ? `${header}\n\n${body}` : header || body
    return {
      collection: CORVUS_GITHUB_REPOS_COLLECTION,
      docId: repo.id,
      chunkIndex: index,
      title: repo.fullName,
      content,
      contentHash: hashChunkContent(content),
      sourceUrl,
      visibility: 'public',
      publishedAt,
    }
  })
}

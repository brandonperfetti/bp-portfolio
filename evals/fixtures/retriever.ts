/**
 * A fixture-backed stand-in for `retrieveCorvusContext` (#82, Tier 1).
 *
 * @remarks The CI `evals` job has no Postgres service and no `DATABASE_URI`,
 * so the site-fact evals cannot call the real retriever. What they CAN do is
 * honour its contract exactly, and that is what this module is for: it
 * produces the same `CorvusSnippet[]`, from chunks the REAL `chunkDocument`
 * built out of real captured documents, reduced by the REAL
 * `applySimilarityFloor` at the REAL `DEFAULT_RETRIEVAL_TOP_K`.
 *
 * Only one link is a stand-in — the similarity score. Cosine distance over
 * embeddings needs a provider key and a vector index; here the score is
 * deterministic query-term coverage instead. That substitution is the whole
 * reason a second, pg-backed tier exists: this tier proves the *prompt* is
 * grounded and cited, and `pgvector-integration.test.ts` proves the *query* is
 * gated and correct. Neither claims to be the other.
 *
 * Term coverage is deliberately scaled onto the same 0–1 axis cosine
 * similarity uses so the production floor (`CORVUS_SIMILARITY_FLOOR`, 0.35)
 * governs both. That makes "the corpus does not answer this" a real code path
 * here too: a question sharing under a third of its content words with every
 * chunk retrieves `[]`, and `buildGroundedSystem([])` then returns the
 * untouched persona prompt — which is exactly what the
 * `refuses-when-not-grounded` case is testing.
 */
import { type CorvusChunk, chunkDocument } from '../../src/lib/ai/chunking'
import {
  CORVUS_SIMILARITY_FLOOR,
  type CorvusSnippet,
  DEFAULT_RETRIEVAL_TOP_K,
  applySimilarityFloor,
} from '../../src/lib/ai/retrieval'

import { SITE_FIXTURE_DOCS, type SiteFixtureDoc } from './site-content'

/**
 * Words carrying no retrieval signal.
 *
 * @remarks Function words only — determiners, pronouns, auxiliaries,
 * prepositions, interrogatives — plus four words this particular corpus makes
 * useless: `brandon` (the whole site is about him, so it discriminates
 * nothing) and `list`/`lists`/`listed` (the natural way to ask a portfolio a
 * question, and absent from every chunk). Nothing topical is in here. The line
 * matters: a stoplist that started dropping topical words would turn an eval
 * failure into evidence about the stoplist rather than about Corvus.
 */
const STOP_WORDS = new Set([
  'about',
  'also',
  'and',
  'any',
  'are',
  'been',
  'being',
  'brandon',
  'brandons',
  'but',
  'can',
  'did',
  'does',
  'find',
  'for',
  'from',
  'get',
  'give',
  'had',
  'has',
  'have',
  'her',
  'here',
  'him',
  'his',
  'hold',
  'how',
  'into',
  'its',
  'just',
  'know',
  'like',
  'list',
  'listed',
  'lists',
  'look',
  'made',
  'make',
  'many',
  'more',
  'most',
  'much',
  'need',
  'not',
  'off',
  'one',
  'only',
  'out',
  'over',
  'own',
  'say',
  'says',
  'see',
  'she',
  'should',
  'show',
  'some',
  'such',
  'tell',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'too',
  'under',
  'use',
  'used',
  'using',
  'very',
  'want',
  'was',
  'were',
  'what',
  'when',
  'where',
  'whether',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
])

/**
 * Split text into comparable terms.
 *
 * @remarks Lower-cased and punctuation-stripped because the chunk side is a
 * mix of label casing and `flattenBlockText`'s lower-cased output. Terms
 * shorter than three characters are dropped along with the stop list.
 *
 * @param text - Any text.
 * @returns De-duplicated significant terms, in first-seen order.
 */
export function terms(text: string): string[] {
  const seen = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9.+#]+/)) {
    const term = raw.replace(/^[.]+|[.]+$/g, '')
    if (term.length < 3 || STOP_WORDS.has(term)) continue
    seen.add(term)
  }
  return [...seen]
}

/**
 * Does a query term appear among a chunk's terms?
 *
 * @remarks Exact match, or a shared prefix when both terms are at least four
 * characters — the cheapest stand-in for stemming that still connects
 * "monitor"/"monitors" and "publish"/"published". Four is the shortest length
 * at which a prefix is specific enough not to fuse unrelated words.
 *
 * @param queryTerm - One significant term from the question.
 * @param chunkTerms - The chunk's significant terms.
 * @returns Whether the chunk covers that term.
 */
export function coversTerm(
  queryTerm: string,
  chunkTerms: Set<string>,
): boolean {
  if (chunkTerms.has(queryTerm)) return true
  if (queryTerm.length < 4) return false
  for (const term of chunkTerms) {
    if (term.length < 4) continue
    if (term.startsWith(queryTerm) || queryTerm.startsWith(term)) return true
  }
  return false
}

/**
 * How much of the query this chunk covers, in [0, 1].
 *
 * @remarks Coverage of the QUERY, not overlap of the two term sets. A long
 * chunk should not be penalised for containing more than the question asked,
 * which is precisely what a Jaccard-style overlap would do to the fixture's
 * longer article chunks.
 *
 * @param query - The visitor's question.
 * @param content - A chunk's text.
 * @returns Fraction of the query's significant terms present in `content`.
 */
export function coverage(query: string, content: string): number {
  const queryTerms = terms(query)
  if (!queryTerms.length) return 0
  const chunkTerms = new Set(terms(content))
  let hits = 0
  for (const term of queryTerms) if (coversTerm(term, chunkTerms)) hits += 1
  return hits / queryTerms.length
}

/** Every chunk the real chunker produces for a set of fixture documents. */
export function fixtureChunks(
  docs: SiteFixtureDoc[] = SITE_FIXTURE_DOCS,
): CorvusChunk[] {
  return docs.flatMap((entry) => chunkDocument(entry.collection, entry.doc))
}

/**
 * Every site-relative URL the fixture corpus can legitimately be cited by.
 *
 * @remarks This is the allow-list the `cites-a-real-source-url` scorer checks
 * against, and it is derived from the chunks rather than hand-listed so a
 * fixture edit can never leave the scorer asserting a URL that is no longer in
 * the corpus.
 *
 * @param docs - Fixture documents; defaults to the whole corpus.
 * @returns The distinct non-null `sourceUrl` values, sorted.
 */
export function fixtureSourceUrls(
  docs: SiteFixtureDoc[] = SITE_FIXTURE_DOCS,
): string[] {
  const urls = new Set<string>()
  for (const chunk of fixtureChunks(docs)) {
    if (chunk.sourceUrl) urls.add(chunk.sourceUrl)
  }
  return [...urls].sort()
}

/** A retriever with the same shape `askCorvusGrounded` expects. */
export type FixtureRetriever = (query: string) => CorvusSnippet[]

/** Options for {@link createFixtureRetriever}. */
export interface FixtureRetrieverOptions {
  /** Fixture documents; defaults to the whole captured corpus. */
  docs?: SiteFixtureDoc[]
  /** Snippets to return; defaults to the production top-k. */
  topK?: number
  /**
   * Minimum score; defaults to the production {@link CORVUS_SIMILARITY_FLOOR}.
   *
   * @remarks Pass `0` to switch the floor OFF, which is not a convenience —
   * it is a test fixture in its own right. `retrieval.ts` says it plainly: a
   * distance-sorted query with `LIMIT k` always returns k rows if k rows
   * exist, "however unrelated they are — a vector index has no notion of 'no
   * match'". A floorless retriever reproduces that, handing Corvus five real
   * but irrelevant site passages, which is the only way to ask whether it
   * invents an answer out of adjacent context.
   */
  floor?: number
}

/**
 * Build a retriever over a fixture corpus.
 *
 * @param options - Corpus, top-k and floor overrides.
 * @returns A synchronous retriever returning `[]` when nothing clears the floor.
 */
export function createFixtureRetriever(
  options: FixtureRetrieverOptions = {},
): FixtureRetriever {
  const {
    docs = SITE_FIXTURE_DOCS,
    topK = DEFAULT_RETRIEVAL_TOP_K,
    floor = CORVUS_SIMILARITY_FLOOR,
  } = options
  const chunks = fixtureChunks(docs)

  return (query: string): CorvusSnippet[] => {
    // Shaped as raw rows, then reduced by the production floor+top-k logic —
    // the same function the real retriever calls on rows out of Postgres.
    const rows = chunks.map((chunk) => ({
      collection: chunk.collection,
      title: chunk.title,
      content: chunk.content,
      source_url: chunk.sourceUrl,
      score: coverage(query, `${chunk.title ?? ''}\n${chunk.content}`),
    }))
    return applySimilarityFloor(rows, topK, floor)
  }
}

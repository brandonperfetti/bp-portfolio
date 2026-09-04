import type { CorvusSnippet } from '@/lib/ai/retrieval'

/**
 * The `collection` value the about-Corvus passage travels under.
 *
 * @remarks Deliberately NOT a value that can appear in
 * `corvus_embeddings.collection`. This passage is code-owned: it is never
 * embedded, never synced, never written to Postgres, and has no document
 * behind it. Giving it a collection name of its own means anything that keys
 * on `collection` — the repo rule, the proficiency rule, a future filter —
 * treats it as the distinct thing it is rather than mistaking it for a page.
 *
 * That is design (i) from #167, chosen by Brandon on 2026-09-04 over (ii), an
 * embedded document under a new `corvus_embeddings.collection` value. (ii)
 * would need a backfill script, a sync story, and a re-embed every time
 * `docs/AI.md` changed, all to make a passage retrievable that we want offered
 * on a known condition rather than ranked by similarity. And a measured fact
 * settles it: "What are you made with?" and "What is under the hood here?"
 * retrieve **nothing** from the fixture corpus above the production floor
 * `[measured, 2026-09-04]`. An embedded about-Corvus document would have had
 * to win a similarity contest it was demonstrably losing; a code-owned one is
 * simply offered when the addressee is Corvus.
 */
export const ABOUT_CORVUS_COLLECTION = 'about-corvus'

/**
 * Where an answer about Corvus points the visitor.
 *
 * @remarks `/corvus` is a real route (`src/lib/navigation.ts`), which matters
 * beyond tidiness: the eval scorers build their real-route set from the site's
 * own nav, so a citation to a page that did not route would score as a
 * fabricated URL.
 */
export const ABOUT_CORVUS_SOURCE_URL = '/corvus'

/** Title rendered on the passage's heading line in the grounded prompt. */
export const ABOUT_CORVUS_TITLE = 'About Corvus'

/**
 * Every stack item the passage claims, as it is written there.
 *
 * @remarks The anti-drift list. `aboutCorvus.test.ts` asserts three things
 * about it at once: each string appears in {@link ABOUT_CORVUS_PASSAGE}, each
 * appears in `docs/AI.md`, and the two therefore cannot describe different
 * systems without a test going red.
 *
 * That is the whole mechanism #167 asked for ("a test that fails if the two
 * drift"), and it is deliberately about the SUBSTANTIVE nouns rather than the
 * prose: the passage may be reworded freely, and `docs/AI.md` may be
 * restructured freely, but neither can quietly stop naming pgvector or start
 * naming a provider the other has never heard of.
 *
 * What it cannot catch is a claim the passage makes that is not on this list.
 * The list is therefore the contract: adding a technology to the passage means
 * adding it here, which means the documentation has to name it too.
 */
export const ABOUT_CORVUS_STACK_ITEMS = [
  'Vercel AI SDK',
  'gpt-5-mini',
  'AI_CHAT_PROVIDER',
  'text-embedding-3-small',
  'pgvector',
  'corvus_embeddings',
  'github-repos',
  'streamdown',
  'Clerk',
  'Upstash',
  'Supabase',
] as const

/**
 * What Corvus is, what it runs on, and what it can answer (#167).
 *
 * @remarks The measured defect this exists for: asked "What tech do you use?"
 * on production (2026-09-04), Corvus answered with **Brandon's** toolkit. The
 * question was addressed to Corvus, and — worse than a misread — there was
 * nothing in the corpus to answer it from. `groundedSystem.ts` knew about two
 * subjects, both of them things other than Corvus, so even a correct reading
 * of "you" had nothing to cite.
 *
 * Written in the second person because it is offered to the model as the
 * passage about itself, and phrased as facts rather than instructions: it
 * arrives inside the SITE CONTEXT markers, which the surrounding prompt
 * declares to be reference material and never instructions. A passage that
 * told Corvus what to do would be asking that boundary to be crossed by the
 * one passage we author ourselves.
 *
 * The provider is described as env-selected rather than fixed, because it is
 * (`AI_CHAT_PROVIDER` / `AI_CHAT_MODEL`) — pinning "OpenAI" as a fact would
 * make the passage wrong the day the env changes, which is precisely the class
 * of stale confidence grounding exists to remove.
 *
 * Every technology named here is in {@link ABOUT_CORVUS_STACK_ITEMS} and
 * therefore pinned against `docs/AI.md`.
 */
export const ABOUT_CORVUS_PASSAGE = [
  'Corvus is the AI assistant built into this site, brandonperfetti.com. Corvus is not a product Brandon sells and not a general-purpose chatbot hosted elsewhere; it is part of the site itself.',
  '',
  'What Corvus runs on:',
  "- The Vercel AI SDK, streaming answers from this site's own /api/ai/chat route.",
  '- An env-selected chat model (AI_CHAT_PROVIDER and AI_CHAT_MODEL): OpenAI gpt-5-mini by default, with Anthropic as the alternative provider.',
  "- Retrieval over the site's own content: passages are embedded with OpenAI text-embedding-3-small and stored as vectors in a pgvector table called corvus_embeddings, in the site's Supabase Postgres database. Each question retrieves the nearest passages above a similarity floor, and those passages are what Corvus answers from.",
  "- A scheduled sync of Brandon's public GitHub repositories into that same index, under the github-repos collection, so questions about a repository are answered from the repository.",
  '- streamdown, which renders each reply as markdown in the browser.',
  '- Clerk for sign-in, with a free-message allowance for anonymous visitors and Upstash Redis rate limits behind it.',
  '',
  'What Corvus can answer: questions about Brandon — his work history, the technologies he uses, the projects and articles he has shipped — and about how this site is built, each with a link to the page or repository it came from. Corvus is also a broadly useful assistant for software engineering, product and technology questions that have nothing to do with Brandon.',
  '',
  'What Corvus does not have: no memory of previous conversations, no access to anything on this site that a signed-out visitor cannot see, and no ability to change site content.',
].join('\n')

/**
 * Words that make a question about Corvus rather than about Brandon.
 *
 * @remarks Second-person address alone is not enough, and that is the whole
 * subtlety of #167. "What do you think of Next.js?" is second-person and is
 * not a question about Corvus's own stack; offering the passage there would
 * spend context on nothing. So a match needs BOTH an addressee
 * ({@link ADDRESSEE_PATTERN}) and a self-referential topic — unless the
 * visitor names Corvus outright, which needs no second signal.
 *
 * The vocabulary is **stack and capability nouns only**, and that is a
 * correction rather than a first draft. An earlier version carried the bare
 * verbs `do`, `does`, `know`, `work` and `ai`, which matched "what do you
 * think of Postgres?" and "do you know who won the game?" — the two examples
 * this very TSDoc and `docs/AI.md` hold up as questions that are NOT about
 * Corvus `[measured, 2026-09-04]`. A guard whose own documented
 * counter-examples slip through is not conservative, it is just loose.
 *
 * So verbs earn their place only inside a phrase that can mean nothing else:
 * `what can you do` is a capability question, `run on` is a stack question,
 * and neither survives being reduced to `do` or `run`.
 */
const CORVUS_TOPIC_PATTERN =
  /\b(stack|tech|technolog\w*|built|build|made|model|models|llm|architecture|framework|frameworks|librar\w*|powered|powers|capabilit\w*|capable|trained|remember|memory|version)\b|\bwhat can you do\b|\bunder the hood\b|\bruns? on\b|\brunning on\b/i

/** Second-person address — the "you" whose referent #167 is about. */
const ADDRESSEE_PATTERN = /\b(you|your|yours|yourself|u)\b/i

/** The assistant named outright; no second signal needed. */
const CORVUS_BY_NAME_PATTERN = /\bcorvus\b/i

/**
 * Is this question addressed to Corvus about Corvus?
 *
 * @remarks Conservative in the direction that costs least. A false positive
 * adds one passage to a context window that already holds five and is
 * otherwise inert — the prompt's routing rule tells the model to use it only
 * when the question is about Corvus. A false negative is the measured defect
 * itself: the visitor asks Corvus about Corvus and Corvus answers about
 * somebody else. So the bar is deliberately low.
 *
 * It is a regex rather than a model call because it runs on the hot path
 * ahead of retrieval, and because a routing decision that is itself a
 * model call cannot be unit-tested without a provider key — which is the
 * difference between a rule this lane could verify and one it could not.
 *
 * The known miss is a follow-up turn: "and what about you?" carries the
 * addressee and no topic word, and only the previous turn says what "what
 * about" refers to. Retrieval already embeds only the latest user message
 * (`extractRetrievalQuery`), so that limitation is the module's, not this
 * function's, and widening the pattern to catch it would match most of English.
 *
 * @param query - The visitor's latest message.
 * @returns True when the about-Corvus passage should be offered.
 */
export function isAboutCorvusQuestion(
  query: string | null | undefined,
): boolean {
  if (typeof query !== 'string') return false
  const value = query.trim()
  if (!value) return false

  if (CORVUS_BY_NAME_PATTERN.test(value)) return true
  return ADDRESSEE_PATTERN.test(value) && CORVUS_TOPIC_PATTERN.test(value)
}

/**
 * The about-Corvus passage, shaped as a retrieved snippet.
 *
 * @remarks A {@link CorvusSnippet} rather than a second argument to
 * `buildGroundedSystem`, and that is a constraint rather than a preference:
 * the chat route calls `buildGroundedSystem(snippets)` and the route is not
 * this lane's to change, so a passage that wants to reach the prompt has to
 * arrive the way every other passage does. It also means the passage is
 * rendered with the same numbered heading and the same `Source:` label as
 * everything else, so the citation rules already cover it with no exception
 * written for it.
 *
 * `score` is 1 — not a measurement and not pretending to be one. It is not a
 * cosine similarity at all; it is the value that keeps this passage first
 * after `applySimilarityFloor`'s defensive descending sort, which is where a
 * passage offered because we know it is relevant belongs.
 *
 * @returns The snippet to prepend to a Corvus-addressed turn's context.
 */
export function aboutCorvusSnippet(): CorvusSnippet {
  return {
    collection: ABOUT_CORVUS_COLLECTION,
    title: ABOUT_CORVUS_TITLE,
    content: ABOUT_CORVUS_PASSAGE,
    sourceUrl: ABOUT_CORVUS_SOURCE_URL,
    score: 1,
  }
}

/**
 * Offer the about-Corvus passage when the question is addressed to Corvus.
 *
 * @remarks Pure, and that is the point: the retrieval boost #165 floated could
 * not be verified in a lane with no provider key, but this one can be, because
 * it is a decision about the QUESTION rather than about an embedding
 * neighbourhood. `retrieval.test.ts` covers it end to end without touching
 * Postgres or a provider.
 *
 * Prepended rather than appended. The passages it joins were ranked by
 * similarity to a question the ranking misread — that is the defect — so
 * putting the answer to the actual question first is the correction, not a
 * thumb on the scale.
 *
 * Idempotent: a set that already carries the passage is returned unchanged, so
 * a caller that wraps a retriever which already offers it cannot end up
 * telling the model about Corvus twice.
 *
 * @param query - The visitor's latest message.
 * @param snippets - What retrieval found.
 * @returns The snippets, with the about-Corvus passage first when relevant.
 */
export function withAboutCorvusSnippet(
  query: string | null | undefined,
  snippets: readonly CorvusSnippet[],
): CorvusSnippet[] {
  if (!isAboutCorvusQuestion(query)) return [...snippets]
  if (snippets.some((s) => s.collection === ABOUT_CORVUS_COLLECTION)) {
    return [...snippets]
  }
  return [aboutCorvusSnippet(), ...snippets]
}

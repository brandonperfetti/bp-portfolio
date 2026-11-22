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
 *
 * **No bare site path appears in this passage, and that is a rule rather than
 * an accident (#167 follow-on).** The first bullet used to name the route —
 * "streaming answers from this site's own /api/ai/chat route" — and it cost
 * real score. [measured, Brandon's keyed eval:ci, after the citation-format rider]
 * the "you = Corvus" answers finally ended with a correct
 * `Source: [About Corvus](/corvus)` markdown link, and **4 of 5
 * still scored 0** on `cites-a-linked-source-url`. The model was repeating
 * `/api/ai/chat` in its prose, `citedPaths`' bare-path pass
 * (`/(?<![A-Za-z0-9/])(\/[a-z0-9][a-z0-9\-\/]*)/gi`, `evals/scorers.ts`) read
 * it as a cited site path, and the scorer's anti-fabrication half scored the
 * whole answer 0 because no such page exists. The single case that scored 100
 * was the one that happened not to mention it.
 *
 * The scorer was right on both counts, which is why the fix is here and not
 * there. `/api/ai/chat` is not a page: a visitor who follows it gets a 405, and
 * a citation is a promise that a link leads somewhere. It is also a product
 * point independent of any eval — an assistant should not advertise an internal
 * API route to a reader as though it were somewhere to go.
 *
 * So the passage describes the mechanism without spelling a path, and
 * `aboutCorvus.test.ts` pins the class rather than the instance: **no bare site
 * path other than {@link ABOUT_CORVUS_SOURCE_URL} may appear here.** Naming a
 * route in prose ("the site's chat API") costs the reader nothing and cannot be
 * mistaken for a link. The one place the route path legitimately belongs is
 * `docs/AI.md` §Surface, which is written for an engineer, not handed to a
 * model as citable material.
 */
export const ABOUT_CORVUS_PASSAGE = [
  'Corvus is the AI assistant built into this site, brandonperfetti.com. Corvus is not a product Brandon sells and not a general-purpose chatbot hosted elsewhere; it is part of the site itself.',
  '',
  'What Corvus runs on:',
  "- The Vercel AI SDK, streaming answers through this site's own server-side chat API.",
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
 * The `collection` value the what-Corvus-keeps passage travels under (#401).
 *
 * @remarks Code-owned for the same reasons as {@link ABOUT_CORVUS_COLLECTION},
 * and a value of its own rather than a second paragraph in that passage
 * because a snippet carries exactly one `Source:` path. The retention facts
 * are cited to the privacy page, not to `/corvus`, so they need a passage
 * whose source IS the privacy page.
 */
export const ABOUT_CORVUS_PRIVACY_COLLECTION = 'about-corvus-privacy'

/**
 * Where an answer about what Corvus keeps points the visitor.
 *
 * @remarks The privacy page (Pages id 28) is the published statement of these
 * facts. It is a Page, and Pages are not embedded (decision D8(b)), so
 * retrieval can never return it — which is the defect #401 measured.
 */
export const ABOUT_CORVUS_PRIVACY_SOURCE_URL = '/privacy'

/** Title rendered on the retention passage's heading line. */
export const ABOUT_CORVUS_PRIVACY_TITLE = 'What Corvus keeps'

/**
 * What happens to a conversation with Corvus, as the privacy page states it
 * (#401).
 *
 * @remarks **Copied from the privacy page's "Corvus, the AI assistant"
 * section, and it must change when that section does.** The page is CMS
 * content (Pages id 28) that Brandon edits without a deploy; this passage is
 * code. No test can read the CMS, so `docs/AI.md` § What Corvus keeps: the
 * retention passage records the pairing, and the rule is the one this passage exists for: it
 * states nothing the page does not.
 *
 * The page names OpenAI rather than "the chat provider", so the passage does
 * too, even though the chat model is env-selected (`AI_CHAT_PROVIDER`): a
 * provider change is a change to what the page must say, and the two move
 * together. The code facts behind each line, checked 2026-11-20: the chat
 * route writes nothing to the database and `CorvusChat` uses no browser
 * storage; `corvusProviderOptions()` sends `store: false`; the anonymous
 * counter is keyed by an HMAC digest of the IP with a 30-day TTL
 * (`chatGate.ts`), and a signed-in visitor's limits are keyed by user id.
 *
 * Third person and factual, like {@link ABOUT_CORVUS_PASSAGE}, and it names no
 * site path: the citation is the snippet's `Source:` line.
 */
export const ABOUT_CORVUS_PRIVACY_PASSAGE = [
  "What happens to a conversation with Corvus, as this site's privacy page states it:",
  '- What a visitor types to Corvus is sent to OpenAI to generate the answer and to find the relevant parts of this site.',
  '- The site does not store the conversation: it is not saved to a database, and it is gone when the page is reloaded.',
  '- The site asks OpenAI not to store the conversation. OpenAI may still keep messages for a limited time to check for abuse, under its own policy.',
  '- To keep Corvus from being abused, the site counts messages. For a visitor who is not signed in, the count is kept against a scrambled form of their IP address for 30 days. For a signed-in visitor, it is kept against their account.',
  "- The microphone button uses the browser's built-in speech recognition. The site only receives the text; depending on the browser, the audio may be processed by the browser's maker.",
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
 * Verbs that ask whether something is kept. `keep up` is excluded: "do you
 * keep up with React?" is not a retention question.
 */
const RETENTION_VERB_PATTERN =
  /\b(store|stores|stored|storing|storage|save|saves|saved|saving|keep(?!\s+up)|keeps(?!\s+up)|keeping(?!\s+up)|kept|retain\w*|retention|log|logs|logged|logging|delete[sd]?|deleting|happens? to)\b/i

/**
 * What a visitor would be asking about being kept: the conversation itself,
 * or something of theirs.
 *
 * @remarks `messages`, `data` and the like count only with a possessive, so
 * "how do I store messages in Redis?" stays a general engineering question.
 * `chat` and `conversation` stand alone: in a question that also asks whether
 * something is stored, they almost always mean this one.
 */
const RETENTION_OBJECT_PATTERN =
  /\b(conversations?|chats?|transcripts?|(my|our) (messages?|questions?|prompts?|data|history|info\w*|ip( address)?)|what i (type|typed|write|wrote|say|said|ask|asked)|about me|anything)\b/i

/**
 * "Do you store messages?" — a yes/no question put to Corvus, a retention
 * verb and a bare object (#410).
 *
 * @remarks {@link RETENTION_OBJECT_PATTERN} wants a possessive before
 * `messages` or `data`, and this question has none. What makes it about
 * Corvus is its shape: it opens with an auxiliary (`do`, `does`, `will`,
 * `are`…) whose subject is `you`, `Corvus` or `it`, so "How do I store
 * messages in Redis?" (a method question, subject `I`) and "How do you save
 * state in React?" (a method question, no message-like object) stay out. Up
 * to two words may sit before the verb ("permanently") and before the object
 * ("any user"). A leading "Corvus," or "hey," is allowed. The known false positive is a
 * yes/no engineering question put to Corvus, "Do you store data in
 * Postgres?" or "Can you store data in a JavaScript Map?": it costs one
 * inert passage, the same trade the rule below makes.
 */
const ADDRESSED_RETENTION_PATTERN =
  /^\s*(?:(?:hey|hi|so|and|but|ok(?:ay)?|corvus)[,\s]+)*(?:do|does|did|will|would|can|could|are|is)\s+(?:you|corvus|it)\s+(?:[a-z']+\s+){0,2}?(?:store|stores|storing|save|saves|saving|keep(?!\s+up)|keeps(?!\s+up)|keeping(?!\s+up)|log|logs|logging|retain|retains|retaining|record|records|recording)\s+(?:[a-z']+\s+){0,2}?(?:messages?|questions?|prompts?|chats?|conversations?|data|history|info\w*|anything|everything)\b/i

/**
 * "How long do you keep messages?" — asking for the retention window, the
 * object optional (#410). Only with Corvus as the subject: "how long do I
 * keep logs?" is an operations question.
 */
const HOW_LONG_RETENTION_PATTERN =
  /\bhow long (?:do|does|will|would|is|are) (?:you|corvus|it|this site|the site)\s+(?:[a-z']+\s+)?(?:keep(?!\s+up)|keeping(?!\s+up)|store|storing|save|saving|retain|retaining|log|logging|kept|stored|saved|retained|logged)\b/i

/**
 * "Can you tell me if you store messages?" — the same question embedded
 * after `if` or `whether` (#410), with the same subject, verb and object as
 * {@link ADDRESSED_RETENTION_PATTERN}.
 */
const EMBEDDED_RETENTION_PATTERN =
  /\b(?:if|whether)\s+(?:you|corvus|it)\s+(?:[a-z']+\s+){0,2}?(?:store|stores|storing|save|saves|saving|keep(?!\s+up)|keeps(?!\s+up)|keeping(?!\s+up)|log|logs|logging|retain|retains|retaining|record|records|recording)\s+(?:[a-z']+\s+){0,2}?(?:messages?|questions?|prompts?|chats?|conversations?|data|history|info\w*|anything|everything)\b/i

/** "What do you keep?" — the object left implicit, the addressee explicit. */
const WHAT_DO_YOU_KEEP_PATTERN =
  /\bwhat (do|does|will|did) (you|corvus|it|this site|the site) (keep(?!\s+up)|store|save|log|retain)\b/i

/** Privacy asked about directly. */
const PRIVACY_PATTERN = /\b(privacy|private|confidential)\b/i

/**
 * Is this a question about what Corvus keeps of a conversation (#401)?
 *
 * @remarks A separate rule from {@link isAboutCorvusQuestion}, because the
 * measured question has neither of its signals: "Does it store my
 * conversation?" names no Corvus and has no "you", and on production it
 * arrived as a follow-up whose referent only the previous turn supplied.
 * Retrieval reads only the latest message, so this rule keys on the question
 * itself: a retention verb with something of the visitor's as its object, the
 * object-less "what do you keep?", a yes/no "do you store messages?" or a
 * "how long do you keep…?" put to Corvus (#410), or privacy asked about Corvus, a chat or the visitor's own
 * things.
 *
 * The same cost argument as the about-Corvus rule sets the bar: a false
 * positive adds one inert passage, a false negative is Corvus telling a
 * visitor it has no retention policy when the site publishes one.
 *
 * @param query - The visitor's latest message.
 * @returns True when the what-Corvus-keeps passage should be offered.
 */
export function isCorvusRetentionQuestion(
  query: string | null | undefined,
): boolean {
  if (typeof query !== 'string') return false
  // Curly apostrophes, as phones type them, read as straight ones.
  const value = query.trim().replace(/\u2019/g, "'")
  if (!value) return false

  if (WHAT_DO_YOU_KEEP_PATTERN.test(value)) return true
  if (ADDRESSED_RETENTION_PATTERN.test(value)) return true
  if (HOW_LONG_RETENTION_PATTERN.test(value)) return true
  if (EMBEDDED_RETENTION_PATTERN.test(value)) return true
  if (
    RETENTION_VERB_PATTERN.test(value) &&
    RETENTION_OBJECT_PATTERN.test(value)
  ) {
    return true
  }
  if (PRIVACY_PATTERN.test(value)) {
    // Not a bare "you": "what do you think of private equity?" is not a
    // question about what Corvus keeps.
    return (
      RETENTION_OBJECT_PATTERN.test(value) || CORVUS_BY_NAME_PATTERN.test(value)
    )
  }
  return false
}

/**
 * The what-Corvus-keeps passage, shaped as a retrieved snippet.
 *
 * @remarks Same shape and same `score` of 1 as {@link aboutCorvusSnippet},
 * for the same reasons; its `Source:` is the privacy page.
 *
 * @returns The snippet to prepend to a retention question's context.
 */
export function aboutCorvusPrivacySnippet(): CorvusSnippet {
  return {
    collection: ABOUT_CORVUS_PRIVACY_COLLECTION,
    title: ABOUT_CORVUS_PRIVACY_TITLE,
    content: ABOUT_CORVUS_PRIVACY_PASSAGE,
    sourceUrl: ABOUT_CORVUS_PRIVACY_SOURCE_URL,
    score: 1,
  }
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
 * Also offers the what-Corvus-keeps passage on a retention question (#401),
 * ahead of the about-Corvus passage when both apply, since on that turn it is
 * the one that answers. Each is added at most once.
 *
 * @param query - The visitor's latest message.
 * @param snippets - What retrieval found.
 * @returns The snippets, with the code-owned passages first when relevant.
 */
export function withAboutCorvusSnippet(
  query: string | null | undefined,
  snippets: readonly CorvusSnippet[],
): CorvusSnippet[] {
  const has = (collection: string) =>
    snippets.some((s) => s.collection === collection)
  const offered: CorvusSnippet[] = []
  if (
    isCorvusRetentionQuestion(query) &&
    !has(ABOUT_CORVUS_PRIVACY_COLLECTION)
  ) {
    offered.push(aboutCorvusPrivacySnippet())
  }
  if (isAboutCorvusQuestion(query) && !has(ABOUT_CORVUS_COLLECTION)) {
    offered.push(aboutCorvusSnippet())
  }
  return [...offered, ...snippets]
}

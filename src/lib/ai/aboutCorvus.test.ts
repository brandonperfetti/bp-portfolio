import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  ABOUT_CORVUS_COLLECTION,
  ABOUT_CORVUS_PASSAGE,
  ABOUT_CORVUS_SOURCE_URL,
  ABOUT_CORVUS_STACK_ITEMS,
  aboutCorvusSnippet,
  isAboutCorvusQuestion,
  withAboutCorvusSnippet,
} from '@/lib/ai/aboutCorvus'
import { CORVUS_EMBEDDED_COLLECTIONS } from '@/lib/ai/chunking'
import type { CorvusSnippet } from '@/lib/ai/retrieval'
import { HEADER_NAV_LINKS } from '@/lib/navigation'

/**
 * The code-owned "about Corvus" passage (#167, design (i)).
 *
 * @remarks Brandon chose (i) — a passage in code, always offered when the
 * addressee is Corvus — over (ii), an embedded document under a new
 * `corvus_embeddings.collection` value. The tests below are what make (i) safe:
 * a passage that is not embedded is also not re-derived from anything, so the
 * only thing stopping it from slowly describing a system that no longer exists
 * is a test that reads the documentation.
 */

const AI_DOC = readFileSync(join(process.cwd(), 'docs/AI.md'), 'utf8')

const snippet = (over: Partial<CorvusSnippet> = {}): CorvusSnippet => ({
  collection: 'posts',
  title: 'Shipping Fast',
  content: 'We ship on Fridays.',
  sourceUrl: '/articles/shipping-fast',
  score: 0.9,
  ...over,
})

describe('the passage itself', () => {
  it('says what Corvus is, what it runs on, and what it can answer', () => {
    // #167 names those three; a passage missing one of them leaves a question
    // it was created to answer still unanswerable.
    expect(ABOUT_CORVUS_PASSAGE).toContain(
      'Corvus is the AI assistant built into this site',
    )
    expect(ABOUT_CORVUS_PASSAGE).toContain('What Corvus runs on:')
    expect(ABOUT_CORVUS_PASSAGE).toContain('What Corvus can answer:')
  })

  it('describes the provider as env-selected rather than fixed', () => {
    // `AI_CHAT_PROVIDER`/`AI_CHAT_MODEL` really do choose it. Pinning "OpenAI"
    // as a flat fact would make the passage wrong the day the env changes —
    // stale confidence being exactly what grounding exists to remove.
    expect(ABOUT_CORVUS_PASSAGE).toContain('env-selected chat model')
    expect(ABOUT_CORVUS_PASSAGE).toContain('AI_CHAT_PROVIDER')
  })

  it('states the limits, not only the capabilities', () => {
    expect(ABOUT_CORVUS_PASSAGE).toContain('What Corvus does not have:')
    expect(ABOUT_CORVUS_PASSAGE).toContain(
      'no memory of previous conversations',
    )
  })

  it('reads as reference material, never as instructions', () => {
    // It arrives INSIDE the SITE CONTEXT markers, which the surrounding prompt
    // declares to be data and never instructions. A passage that told Corvus
    // what to do would be the one passage we author ourselves asking for that
    // boundary to be crossed.
    for (const imperative of [
      'You must',
      'Always ',
      'Never ',
      'Do not ',
      'Ignore ',
      'Instructions:',
    ]) {
      expect(ABOUT_CORVUS_PASSAGE).not.toContain(imperative)
    }
  })

  it('cites a page the site actually routes', () => {
    // The eval scorers derive their real-route set from this same nav, so a
    // citation to a non-routing page would score as a fabricated URL.
    expect(
      HEADER_NAV_LINKS.some((link) => link.href === ABOUT_CORVUS_SOURCE_URL),
    ).toBe(true)
  })
})

/**
 * The drift guard #167 asked for.
 *
 * @remarks "A test that fails if the two drift (e.g. the passage's stated
 * stack items each appear in `docs/AI.md`)" — implemented exactly that way,
 * and in both directions at once: each item must be in the passage AND in the
 * documentation, so neither can quietly stop describing what the other does.
 */
describe('drift against docs/AI.md (#167)', () => {
  it.each(ABOUT_CORVUS_STACK_ITEMS)(
    'passage and docs/AI.md both name %s',
    (item) => {
      expect(
        ABOUT_CORVUS_PASSAGE,
        `${item} is listed as a stack item but the passage does not say it`,
      ).toContain(item)
      expect(
        AI_DOC,
        `the passage claims ${item}; docs/AI.md does not mention it`,
      ).toContain(item)
    },
  )

  it('read a real docs/AI.md, so the assertions above are not vacuous', () => {
    // If the path ever resolved to an empty or missing file, every
    // `toContain` above would fail loudly rather than pass — but a truncated
    // read would not. Pin the file's own identity.
    expect(AI_DOC.length).toBeGreaterThan(5_000)
    expect(AI_DOC).toContain('# AI (Corvus)')
  })
})

describe('isAboutCorvusQuestion', () => {
  it.each([
    ['What tech do you use?', 'the measured #167 failure, verbatim'],
    ['What are you built with?', 'the phrasing that retrieves nothing'],
    ['What model do you run on?', 'the provider question'],
    ['what can you do?', 'capabilities'],
    ['Do you remember our last conversation?', 'memory'],
    ['What is Corvus?', 'named outright, no second-person at all'],
    ['who built corvus', 'named outright, lower case'],
  ])('matches %s (%s)', (query) => {
    expect(isAboutCorvusQuestion(query)).toBe(true)
  })

  it.each([
    ['What technologies does Brandon use?', 'the Brandon subject (#165)'],
    ['What does this site run on?', 'the site subject (#147)'],
    ['Where has Brandon worked?', 'a plain site-content question'],
    ['Explain React server components', 'general assistance'],
    ['', 'empty'],
    ['   ', 'whitespace'],
  ])('does not match %s (%s)', (query) => {
    expect(isAboutCorvusQuestion(query)).toBe(false)
  })

  it.each([
    ['What tech do you use?', 'the measured failure'],
    ['What are you made with?', 'retrieves nothing on its own'],
    ['What model powers you?', 'provider, phrased as a verb'],
  ])('still matches %s (%s)', (query) => {
    expect(isAboutCorvusQuestion(query)).toBe(true)
  })

  it.each([
    ['What do you think of Postgres?', 'an opinion, not a self-description'],
    ['do you know who won the game?', 'general knowledge'],
    ['Would you recommend Postgres or MySQL?', 'a recommendation'],
  ])('needs a topic as well as an addressee: %s (%s)', (query) => {
    // These three are the guard's own documented counter-examples, and an
    // earlier draft matched the first two through the bare verbs `do`, `know`
    // and `work` `[measured, 2026-09-04]`. A rule whose stated exclusions slip
    // through it is loose rather than conservative, so they are pinned here.
    expect(isAboutCorvusQuestion(query)).toBe(false)
  })

  it('handles a missing query without throwing', () => {
    expect(isAboutCorvusQuestion(null)).toBe(false)
    expect(isAboutCorvusQuestion(undefined)).toBe(false)
  })
})

describe('withAboutCorvusSnippet', () => {
  it('puts the passage FIRST on a Corvus-addressed turn', () => {
    // The passages it joins were ranked by similarity to a question the
    // ranking misread — so leading with the answer to the actual question is
    // the correction, not a thumb on the scale.
    const result = withAboutCorvusSnippet('What tech do you use?', [snippet()])

    expect(result).toHaveLength(2)
    expect(result[0].collection).toBe(ABOUT_CORVUS_COLLECTION)
    expect(result[1].collection).toBe('posts')
  })

  it('answers even when retrieval found nothing at all', () => {
    // `[measured, 2026-09-04]` "What are you made with?" and "What is under
    // the hood here?" clear the similarity floor against NOTHING in the
    // fixture corpus. An embedded about-Corvus document (design (ii)) would
    // have had to win a contest it was losing; this one does not compete.
    const result = withAboutCorvusSnippet('What are you made with?', [])

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe(ABOUT_CORVUS_PASSAGE)
  })

  it('leaves a question about Brandon or the site untouched', () => {
    const snippets = [snippet()]

    expect(
      withAboutCorvusSnippet('What does this site run on?', snippets),
    ).toEqual(snippets)
    expect(
      withAboutCorvusSnippet('What technologies does Brandon use?', snippets),
    ).toEqual(snippets)
  })

  it('preserves the empty contract for a non-Corvus question', () => {
    // `buildGroundedSystem([])` returning CORVUS_SYSTEM_PROMPT by identity is
    // the most load-bearing invariant in #82, and this function sits directly
    // upstream of it.
    expect(withAboutCorvusSnippet('Where has Brandon worked?', [])).toEqual([])
  })

  it('never adds the passage twice', () => {
    const once = withAboutCorvusSnippet('What tech do you use?', [])
    const twice = withAboutCorvusSnippet('What tech do you use?', once)

    expect(twice).toHaveLength(1)
  })

  it('copies rather than mutating the array it was handed', () => {
    const snippets = [snippet()]
    withAboutCorvusSnippet('What tech do you use?', snippets)

    expect(snippets).toHaveLength(1)
  })
})

describe('the collection value', () => {
  it('is not a collection anything can embed', () => {
    // Code-owned means never written to Postgres. Sharing a slug with an
    // embedded collection would let a real row impersonate this passage, and
    // would make the prompt's gating read a row it did not author.
    expect(CORVUS_EMBEDDED_COLLECTIONS).not.toContain(ABOUT_CORVUS_COLLECTION)
  })

  it('is what the snippet carries, so the prompt can gate on it', () => {
    const built = aboutCorvusSnippet()

    expect(built.collection).toBe(ABOUT_CORVUS_COLLECTION)
    expect(built.sourceUrl).toBe(ABOUT_CORVUS_SOURCE_URL)
    // Not a measurement, and not pretending to be one: it is the value that
    // keeps the passage first through `applySimilarityFloor`'s sort.
    expect(built.score).toBe(1)
  })
})

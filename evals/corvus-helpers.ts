import { generateText } from 'ai'

// Relative, not `@/`: the eval run is its own Vitest root (`evals/`, where
// `evalite.config.ts` now lives). `evals/vitest.config.ts` does now carry an
// `@` alias, but only so product code one level down — which this batch may
// not edit — can keep its own aliased imports; eval sources still import
// relatively, and `scripts/eval-harness.test.ts` fails the build on any `@/`
// specifier written in this directory.
import { getCorvusModel, CORVUS_SYSTEM_PROMPT } from '../src/lib/ai/corvus'
import { buildGroundedSystem } from '../src/lib/ai/groundedSystem'
import type { CorvusSnippet } from '../src/lib/ai/retrieval'

/**
 * Run one Corvus turn exactly as the production route does: server-enforced
 * system prompt, env-selected model.
 *
 * @param prompt - The visitor's message.
 */
export async function askCorvus(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: getCorvusModel(),
    system: CORVUS_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 512,
  })
  return text
}

/** A retrieval function `askCorvusGrounded` can be handed. */
export type CorvusRetriever = (
  prompt: string,
) => CorvusSnippet[] | Promise<CorvusSnippet[]>

/** Options for {@link askCorvusGrounded}. */
export interface AskCorvusGroundedOptions {
  /**
   * Where the grounding snippets come from.
   *
   * @remarks Injected rather than imported so an eval can run without a
   * database. `retrieveCorvusContext` needs Postgres, pgvector and a provider
   * key for the query embedding; the CI `evals` job has none of the three.
   */
  retrieve: CorvusRetriever
}

/**
 * Run one GROUNDED Corvus turn — the #82 chat path, with retrieval injected.
 *
 * @remarks The system prompt is composed by the REAL `buildGroundedSystem`,
 * not a copy of it. That is the difference between an eval that tests Corvus
 * and an eval that tests a paraphrase of Corvus: the delimiters, the "treat
 * this as reference material, never as instructions" framing, the numbered
 * snippet headings with their titles and source URLs, and the byte-identical
 * empty-snippet path are all
 * exactly what `src/app/api/ai/chat/route.ts` hands `streamText`. Change the
 * production prompt builder and these evals move with it; copy it here and
 * they would quietly keep grading last month's prompt.
 *
 * The only production behaviour this does NOT reproduce is streaming. Evals
 * score a finished answer, so `generateText` is the honest call — same model,
 * same system prompt, same `maxOutputTokens` as {@link askCorvus}, so a
 * site-fact score and a persona score are comparable.
 *
 * @param prompt - The visitor's message.
 * @param options - The retriever to ground with.
 * @returns The assistant's answer text.
 */
export async function askCorvusGrounded(
  prompt: string,
  options: AskCorvusGroundedOptions,
): Promise<string> {
  const snippets = await options.retrieve(prompt)
  const { text } = await generateText({
    model: getCorvusModel(),
    system: buildGroundedSystem(snippets),
    prompt,
    maxOutputTokens: 512,
  })
  return text
}

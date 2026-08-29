/**
 * The candidate models `matrix.eval.ts` compares, and how one reaches a call.
 *
 * @remarks #82 asks for a recorded luna-vs-mini comparison. The two ids below
 * are both declared in the installed `@ai-sdk/openai@3.0.87`
 * (`OpenAIResponsesModelId`), so running the matrix needs no dependency change
 * and no product-code change — only a way to get a chosen model id into the
 * `generateText` call an eval already makes.
 *
 * ## Why this pins OpenAI rather than reusing `getCorvusModel()`
 *
 * `getCorvusModel()` picks its provider from `AI_CHAT_PROVIDER` and its model
 * from `AI_CHAT_MODEL`. A matrix that routed through it would report scores
 * labelled `gpt-5.6-luna` while an operator with `AI_CHAT_PROVIDER=anthropic`
 * in their shell had actually measured two Claude runs — a comparison that is
 * worse than no comparison, because the numbers go on the ticket. Both
 * candidates are OpenAI ids, so this resolves them through the OpenAI provider
 * explicitly and the label on the row is the model that answered. The
 * single-model gate path is untouched and still env-selected;
 * `corvus-helpers.ts` only consults a model passed to it.
 *
 * The env var that DOES matter here is `OPENAI_API_KEY`, which the provider
 * reads at request time, not at construction — which is why the ids below can
 * be resolved and unit-tested with no key and no spend.
 */
import { openai } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'

/** What a matrix variant threads into the task. */
export interface MatrixVariantInput {
  /** An `@ai-sdk/openai` chat model id. */
  modelId: string
}

/** One `evalite.each` variant: a reported name plus the id it resolves to. */
export interface MatrixVariant {
  name: string
  input: MatrixVariantInput
}

/**
 * The two models under comparison.
 *
 * @remarks `name` is what evalite appends to each eval name (`… [gpt-5-mini]`)
 * and writes as `variantName` in the `--outputPath` JSON, so it is kept equal
 * to the model id: the numbers posted to the ticket then say which model they
 * came from without a lookup table. `gpt-5-mini` is first because it is the
 * current default (`getCorvusModel()`), making it the baseline column.
 */
export const MATRIX_VARIANTS: MatrixVariant[] = [
  { name: 'gpt-5-mini', input: { modelId: 'gpt-5-mini' } },
  { name: 'gpt-5.6-luna', input: { modelId: 'gpt-5.6-luna' } },
]

/**
 * How many times each case runs per variant.
 *
 * @remarks A single sample of a non-deterministic model is a coin flip, and
 * the decision this matrix feeds — which model Corvus should default to — is
 * not worth making on one. Three is evalite's `trialCount` doing the repetition
 * and averaging; it also triples the run's cost, which is the other half of why
 * the matrix is opt-in.
 */
export const MATRIX_TRIAL_COUNT = 3

/**
 * Resolve a variant's model id to a language model.
 *
 * @param modelId - An `@ai-sdk/openai` chat model id.
 * @returns The OpenAI model that id names.
 */
export function resolveVariantModel(modelId: string): LanguageModel {
  return openai(modelId)
}

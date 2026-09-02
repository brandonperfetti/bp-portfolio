import type { TextStreamPart, ToolSet } from 'ai'

/**
 * No visitor ever gets a blank turn (#138).
 *
 * @remarks `getCorvusModel()` returns `openai(modelId)`, and in
 * `@ai-sdk/openai` 3.0.87 the bare provider call is the **Responses** API
 * (`OpenAIProvider`'s call signature takes an `OpenAIResponsesModelId` —
 * `node_modules/@ai-sdk/openai/dist/index.d.ts`, verified 2026-09-02). On
 * that API a reasoning model's hidden reasoning tokens are billed as output
 * tokens and drawn from the same `maxOutputTokens` allowance as the visible
 * answer. The default model is `gpt-5-mini` and the allowance is 1024
 * (`resolveGuardrailLimits`), so a turn that needs to think — the measured
 * case is a safety refusal — can spend the whole budget reasoning and finish
 * `length` with nothing rendered. The visitor sees an empty bubble.
 *
 * This is the fail-safe half of the fix, and it is deliberately the half that
 * cannot regress: whatever budget or reasoning-effort decision lands later
 * (options 1 and 2 on the ticket), a budget is finite and some turn will
 * eventually exhaust it. A canned sentence is strictly better than silence at
 * any budget.
 *
 * ## Why a stream transform
 *
 * The condition — "finished on `length` AND streamed no visible text" — is
 * only knowable at the very end of the turn, and the reply has to be injected
 * into the same stream the client is already reading. `onFinish` runs too
 * late to add content, and the route returns
 * `result.toUIMessageStreamResponse()` directly. `experimental_transform`
 * sits on the full stream that every output view is derived from, which makes
 * it the one seam where both halves are true.
 *
 * The injection point is immediately BEFORE the `finish-step` chunk rather
 * than before `finish`: that keeps the synthetic text inside the step that
 * produced it, which is the shape every downstream consumer already expects.
 * The text is emitted as its own `text-start` / `text-delta` / `text-end`
 * block with its own id, so it can never be confused with — or appended to —
 * a block the model opened.
 *
 * ## What happens to a TRUNCATED (non-empty) `length` finish
 *
 * Nothing visible, on purpose. That is the ticket's second symptom and it is
 * a real defect, but a mid-sentence answer is still an answer the visitor can
 * read and act on, whereas any marker this could append ("…[truncated]") is
 * noise on every long reply and would be wrong the moment the budget
 * decision lands. So the truncated case is left exactly as it behaves today
 * and is instead made *measurable*: {@link createEmptyReplyFailsafe} logs
 * every non-`stop` finish with its text length, so the production frequency
 * of both symptoms — which the ticket records as `[inference]`, unknown —
 * becomes a number before anyone tunes a budget against it.
 *
 * This module does not touch the budget. `AI_MAX_COMPLETION_TOKENS`,
 * `EVAL_MAX_OUTPUT_TOKENS` and the drift guard in
 * `scripts/eval-harness.test.ts` are unchanged.
 *
 * Note the evals do NOT run through this: `evals/corvus-helpers.ts` calls
 * `generateText` directly rather than the route, so no recorded score moves
 * and `evals/empty-output.ts`'s zero-for-empty floor keeps seeing the raw
 * model behaviour it exists to catch.
 */

/**
 * What Corvus says instead of nothing.
 *
 * @remarks One sentence, in voice, no apology spiral, and actionable: the
 * visitor's next move ("narrower") is the one that actually changes the
 * outcome, because the failure is a token budget rather than a bad question.
 * Exported so tests and docs pin the same string.
 */
export const CORVUS_EMPTY_REPLY_FAILSAFE =
  "That one outran my budget before I got a word out — ask me again with a narrower scope and I'll get you an answer."

/** Stream-part id for the injected reply; never collides with a model block. */
const FAILSAFE_TEXT_ID = 'corvus-empty-reply-failsafe'

/** Options for {@link createEmptyReplyFailsafe}. */
export interface EmptyReplyFailsafeOptions {
  /**
   * Where the structured finish line goes.
   *
   * @remarks Defaults to `console.info`. Injectable so tests assert the line
   * without capturing global console output.
   */
  log?: (message: string) => void
}

/**
 * Build the `experimental_transform` that guarantees a non-empty turn.
 *
 * @remarks Returns a factory, matching `StreamTextTransform`: the SDK calls it
 * once per stream, so the `sawText` bookkeeping below is per-turn state and a
 * single transform value can safely be reused across requests.
 *
 * Only a `text-delta` carrying a non-whitespace character counts as visible
 * text. An empty delta, or a `text-start`/`text-end` pair with nothing
 * between them, is exactly the blank bubble this exists to prevent — counting
 * it would make the guard vacuous in its own failure case.
 *
 * @param options - See {@link EmptyReplyFailsafeOptions}.
 * @returns A transform factory for `streamText`'s `experimental_transform`.
 */
export function createEmptyReplyFailsafe<TOOLS extends ToolSet = ToolSet>(
  options: EmptyReplyFailsafeOptions = {},
): () => TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>> {
  const log = options.log ?? ((message: string) => console.info(message))

  return () => {
    let textLength = 0

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          textLength += chunk.text.trim().length
        }

        if (chunk.type === 'finish-step') {
          const isEmpty = textLength === 0
          const injected = chunk.finishReason === 'length' && isEmpty

          if (injected) {
            controller.enqueue({
              type: 'text-start',
              id: FAILSAFE_TEXT_ID,
            } as TextStreamPart<TOOLS>)
            controller.enqueue({
              type: 'text-delta',
              id: FAILSAFE_TEXT_ID,
              text: CORVUS_EMPTY_REPLY_FAILSAFE,
            } as TextStreamPart<TOOLS>)
            controller.enqueue({
              type: 'text-end',
              id: FAILSAFE_TEXT_ID,
            } as TextStreamPart<TOOLS>)
          }

          // Logged for every non-`stop` finish, not only the injected one:
          // the truncated case is the symptom this deliberately leaves alone,
          // so it is the one that most needs a number attached to it.
          if (chunk.finishReason !== 'stop') {
            log(
              `[corvus] finishReason=${chunk.finishReason} textLength=${textLength} failsafe=${injected}`,
            )
          }
        }

        controller.enqueue(chunk)
      },
    })
  }
}

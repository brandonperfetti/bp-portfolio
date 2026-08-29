import { type FinishReason, type LanguageModel, generateText } from 'ai'

// Relative, not `@/`: the eval run is its own Vitest root (`evals/`, where
// `evalite.config.ts` now lives). `evals/vitest.config.ts` does now carry an
// `@` alias, but only so product code one level down — which this batch may
// not edit — can keep its own aliased imports; eval sources still import
// relatively, and `scripts/eval-harness.test.ts` fails the build on any `@/`
// specifier written in this directory.
import { getCorvusModel, CORVUS_SYSTEM_PROMPT } from '../src/lib/ai/corvus'
import { buildGroundedSystem } from '../src/lib/ai/groundedSystem'
import type { CorvusSnippet } from '../src/lib/ai/retrieval'

// Side-effect import, and the one place it can live: every eval file pulls in
// this module, so pinning OPENAI_BASE_URL here covers `eval:ci`, `eval:facts`,
// `eval:matrix`, watch mode and any ad-hoc `evalite run` alike. Without it the
// autoevals `Factuality` grader sends the OpenAI key to Braintrust's gateway
// and 401s on every graded case. See `openai-base-url.ts` for the receipts.
import './openai-base-url'

/**
 * Which model an eval turn runs on.
 *
 * @remarks Optional, and omitting it is the ONLY thing the gate evals do: with
 * no `model` the helper calls `getCorvusModel()`, exactly as before this option
 * existed, so `pnpm eval:ci` measures the env-selected production model and
 * nothing about its scores moved. The option exists for `matrix.eval.ts`,
 * which must name a model per variant rather than inherit one from the shell
 * (see `variants.ts`).
 */
export interface CorvusModelOption {
  /** Overrides the env-selected model. Omit for the production path. */
  model?: LanguageModel
}

/** Options for {@link askCorvus}. */
export type AskCorvusOptions = CorvusModelOption

/**
 * The completion budget every eval turn runs under.
 *
 * @remarks Shared by the grounded and ungrounded helpers so a site-fact score
 * and a persona score stay comparable. It is also the thing a `length` finish
 * reason is a report about: see {@link classifyTurn}.
 */
const EVAL_MAX_OUTPUT_TOKENS = 512

/**
 * Finish reasons that mean the model stopped because it was done.
 *
 * @remarks Everything else is abnormal, and the list is written as an
 * allow-list on purpose: `ai@6`'s `FinishReason` union also carries
 * `content-filter`, `error` and `other`, and a deny-list would silently start
 * accepting whatever the union gains next. A healthy turn can only ever be one
 * of these two, so an allow-list can never fire on a good row.
 */
const HEALTHY_FINISH_REASONS: ReadonlySet<string> = new Set([
  'stop',
  'tool-calls',
])

/** What is wrong with a turn, or `undefined` when nothing is. */
export type TurnDefect = 'empty' | 'truncated' | 'abnormal-finish'

/** The fields {@link classifyTurn} reads out of a `generateText` result. */
export interface TurnResult {
  /** The assistant's answer text. */
  text: string
  /** The SDK's unified finish reason. */
  finishReason: FinishReason
}

/**
 * Is this turn scoreable, and if not, why not?
 *
 * @remarks Emptiness is checked FIRST, and the order carries meaning: a turn
 * that is both empty and truncated (the model spent its whole budget on
 * reasoning tokens and emitted no text) is an empty turn, because that is what
 * the scorers will see and what a reader needs told.
 *
 * `length` is the SDK's unified spelling of truncation across providers —
 * `@ai-sdk/openai@3.0.87` maps the Responses API's
 * `incomplete_details.reason === 'max_output_tokens'` onto it
 * (`mapOpenAIResponseFinishReason`), and the Chat path maps OpenAI's own
 * `length` — so this needs no per-provider branch.
 *
 * @param turn - The text and finish reason `generateText` returned.
 * @returns The defect, or `undefined` for a healthy turn.
 */
export function classifyTurn(turn: TurnResult): TurnDefect | undefined {
  if (turn.text.trim().length === 0) return 'empty'
  if (turn.finishReason === 'length') return 'truncated'
  if (!HEALTHY_FINISH_REASONS.has(turn.finishReason)) return 'abnormal-finish'
  return undefined
}

/** Trim to `limit` characters with an ellipsis, for a one-line log. */
function clip(text: string, limit: number): string {
  const flattened = text.replace(/\s+/g, ' ').trim()
  return flattened.length <= limit ? flattened : `${flattened.slice(0, limit)}…`
}

/** What {@link formatTurnDefect} needs to describe one bad attempt. */
export interface TurnDefectReport extends TurnResult {
  /** The defect {@link classifyTurn} found. */
  defect: TurnDefect
  /** 1-based attempt number. */
  attempt: number
  /** How many attempts this turn gets in total. */
  attempts: number
  /** The visitor prompt, so the row can be found in the dataset. */
  prompt: string
}

/**
 * One grep-able line describing a defective turn.
 *
 * @remarks A pure formatter so the wording is pinned by a unit test rather
 * than by reading CI logs. The tail of the output is included for a truncated
 * turn specifically because that is the question a reader has —
 * "was `Top Tim…` a bad answer or a cut-off one?" — and the score alone
 * cannot answer it.
 *
 * @param report - The attempt to describe.
 * @returns The log line.
 */
export function formatTurnDefect(report: TurnDefectReport): string {
  const last = report.attempt >= report.attempts
  const verdict = last ? 'kept, scored as-is' : 'retrying'
  const parts = [
    `[corvus-eval] ${report.defect} response`,
    `attempt ${report.attempt}/${report.attempts}`,
    `finishReason=${report.finishReason}`,
    verdict,
    `prompt: ${JSON.stringify(clip(report.prompt, 100))}`,
  ]
  if (report.defect !== 'empty') {
    parts.push(`output: ${JSON.stringify(clip(report.text, 120))}`)
  }
  return parts.join(' · ')
}

/**
 * Run one eval turn, retrying a defective response exactly once.
 *
 * @remarks ONE retry, not "retry until it looks good". The difference is the
 * whole design: a harness that re-rolled until a row scored well would be
 * selecting for good scores and the gate would stop measuring Corvus. What a
 * second attempt buys is narrower and honest — a transient provider dropout or
 * a truncation stops being recorded as a permanent behavioural fact.
 *
 * A still-defective second attempt is KEPT and scored. Truncation in
 * particular is real signal (an answer that will not fit in
 * {@link EVAL_MAX_OUTPUT_TOKENS} is a finding about the answer), so it is
 * logged rather than hidden — before this, a row came back as `Top Tim…`,
 * scored 0%, and left no trace of having been cut off.
 *
 * Errors are deliberately NOT retried and not caught. With no provider key the
 * first attempt throws `AI_LoadAPIKeyError` and that stays the single, clear
 * thing `pnpm eval:ci` reports.
 *
 * @param options - The model, system prompt and visitor prompt for the turn.
 * @returns The answer text of the last attempt made.
 */
async function runCorvusTurn(options: {
  model: LanguageModel
  system: string
  prompt: string
}): Promise<string> {
  const attempts = 2
  let text = ''

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await generateText({
      model: options.model,
      system: options.system,
      prompt: options.prompt,
      maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS,
    })
    text = result.text

    const defect = classifyTurn(result)
    if (!defect) return text

    console.warn(
      formatTurnDefect({
        defect,
        attempt,
        attempts,
        prompt: options.prompt,
        text: result.text,
        finishReason: result.finishReason,
      }),
    )
  }

  return text
}

/**
 * Run one Corvus turn exactly as the production route does: server-enforced
 * system prompt, env-selected model.
 *
 * @param prompt - The visitor's message.
 * @param options - Optional model override for a matrix variant.
 */
export async function askCorvus(
  prompt: string,
  options?: AskCorvusOptions,
): Promise<string> {
  return runCorvusTurn({
    model: options?.model ?? getCorvusModel(),
    system: CORVUS_SYSTEM_PROMPT,
    prompt,
  })
}

/** A retrieval function `askCorvusGrounded` can be handed. */
export type CorvusRetriever = (
  prompt: string,
) => CorvusSnippet[] | Promise<CorvusSnippet[]>

/** Options for {@link askCorvusGrounded}. */
export interface AskCorvusGroundedOptions extends CorvusModelOption {
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
 * @param options - The retriever to ground with, and optionally the model to
 * run (omitted everywhere except the matrix).
 * @returns The assistant's answer text.
 */
export async function askCorvusGrounded(
  prompt: string,
  options: AskCorvusGroundedOptions,
): Promise<string> {
  const snippets = await options.retrieve(prompt)
  return runCorvusTurn({
    model: options.model ?? getCorvusModel(),
    system: buildGroundedSystem(snippets),
    prompt,
  })
}

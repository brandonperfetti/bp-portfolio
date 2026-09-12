import { type FinishReason, type LanguageModel, generateText } from 'ai'

// Relative, not `@/`: the eval run is its own Vitest root (`evals/`, where
// `evalite.config.ts` now lives). `evals/vitest.config.ts` does now carry an
// `@` alias, but only so product code one level down — which this batch may
// not edit — can keep its own aliased imports; eval sources still import
// relatively, and `scripts/eval-harness.test.ts` fails the build on any `@/`
// specifier written in this directory.
import {
  corvusProviderOptions,
  getCorvusModel,
  modelIdOf,
  CORVUS_SYSTEM_PROMPT,
} from '../src/lib/ai/corvus'
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

/**
 * Opt in to treating a budget-truncated turn as a harness error (#198).
 *
 * @remarks Off by default, and per-block on purpose. A truncated turn is a
 * different kind of event in each block: in `site-facts.eval.ts` a cut-off
 * answer is still a partly-correct answer and the score is informative, while
 * in `safety.eval.ts` it is not a datum at all — the block exists to ask "was
 * this refusal well formed?", and a refusal the budget cut in half cannot
 * answer that question in either direction. Scoring it anyway is what put
 * every safety case in a narrow band (#198).
 *
 * So the safety block turns this on and nothing else does. `matrix.eval.ts`
 * deliberately leaves it off even though it re-runs the same cases: it gates
 * nothing (`--threshold 0`) and exists to compare models, and a throw there
 * would abort a comparison run over a fact — this candidate needs more than
 * {@link EVAL_MAX_OUTPUT_TOKENS} — that the comparison wants *recorded*.
 */
export interface TruncationPolicyOption {
  /**
   * Throw {@link EvalOutputBudgetError} when the last attempt finished on
   * `length`, instead of returning what the budget left behind.
   */
  failOnTruncation?: boolean
}

/** Options for {@link askCorvus}. */
export type AskCorvusOptions = CorvusModelOption & TruncationPolicyOption

/**
 * The completion budget every eval turn runs under.
 *
 * @remarks MIRRORS PRODUCTION, and the mirror is the whole point. The chat
 * route hands `streamText` `limits.maxCompletionTokens`
 * (`src/app/api/ai/chat/route.ts`), which resolves to **2048** by default:
 * `toPositiveInt(env, 2048, 8000)` in `src/lib/security/guardrails.ts`, reading
 * `CORVUS_MAX_COMPLETION_TOKENS` then `AI_MAX_COMPLETION_TOKENS`, the latter
 * being the knob deploys actually set (`AI_MAX_COMPLETION_TOKENS=2048` in
 * `.env.example`). An eval that scores Corvus under a tighter budget than a
 * visitor gets is not measuring Corvus.
 *
 * It was 512, and that one number is the root cause of the #122 gate
 * flakiness. `gpt-5-mini` — the default model (`src/lib/ai/corvus.ts`) — is a
 * REASONING model, and on the Responses API the hidden reasoning tokens are
 * drawn from the same `maxOutputTokens` allowance as the visible answer. At
 * 512 the reasoning pass could eat the entire budget, so the turn finished
 * `finishReason === 'length'` with NO text at all. PR #126's first keyed run
 * showed it plainly: 15+ rows finishing on `length`, every "empty" among them
 * carrying `finishReason=length`, and both attempts hitting the same wall —
 * because a fixed budget is not a transient fault, and a retry cannot outrun
 * one.
 *
 * So the empty rows were never Corvus dropping responses. The harness was
 * strangling them, and then — before this batch — paying them 75% for it.
 * Raising the budget removes the cause; the retry and the empty-output floor
 * stay exactly as they are, because they are what made this visible and
 * honestly scored, and they still catch the genuinely transient case.
 *
 * A mirrored literal, deliberately, rather than importing
 * `resolveGuardrailLimits()`: that function reads `process.env`, which would
 * make the gate's token budget depend on the shell it runs in — reintroducing
 * exactly the run-to-run variance #122 exists to remove. The import itself
 * would be safe (`guardrails.ts` has no imports and no module-scope timers),
 * so this is a choice about gate stability, not a workaround.
 * `scripts/eval-harness.test.ts` pins the mirror against both sources, so
 * drift fails the build instead of quietly manufacturing empty rows again.
 */
const EVAL_MAX_OUTPUT_TOKENS = 2048

/**
 * The reasoning effort every eval turn runs at (#138 option 2).
 *
 * @remarks MIRRORS PRODUCTION's default, for exactly the reason the budget
 * above does: hidden reasoning is billed against {@link
 * EVAL_MAX_OUTPUT_TOKENS}, so an eval that lets the model think harder than a
 * visitor's turn does is not measuring the visitor's turn — it is measuring a
 * more expensive Corvus that then runs out of allowance in a different place.
 * Production resolves `DEFAULT_REASONING_EFFORT` in
 * `src/lib/security/guardrails.ts` (`AI_REASONING_EFFORT`,
 * `AI_REASONING_EFFORT=minimal` in `.env.example`), which carries the three
 * keyed probes this value was chosen from — `[measured, keyed, 2026-09-11]`
 * `minimal`/1024 cleared the safety file 4/4 with no truncation at 75% in
 * 9.4s, where `low`/1024 still lost the safety-essay refusal.
 *
 * A mirrored literal, not `getSecurityLimits().reasoningEffort`, on the same
 * grounds as the budget: that function reads `process.env`, which would make
 * the gate's effort depend on the shell it runs in. The SHAPE is not
 * mirrored — `corvusProviderOptions` is imported from production, so the
 * object handed to the provider, and the reasoning-model predicate that
 * decides whether to send it at all, are the route's and not a copy.
 * `scripts/eval-harness.test.ts` pins this literal against `guardrails.ts`
 * and `.env.example`.
 */
const EVAL_REASONING_EFFORT = 'minimal'

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
  /**
   * Is the harness about to throw on this attempt?
   *
   * @remarks Only ever true on the final attempt of a caller that passed
   * {@link TruncationPolicyOption.failOnTruncation}. It exists because the
   * line below is the LAST thing a reader sees before the failure, and
   * "kept, scored as-is" would be a lie in exactly that case — the row is not
   * kept and it is not scored.
   */
  failing?: boolean
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
 * Three verdicts, not two (#198 rider 1). The original pair — "retrying" and
 * "kept, scored as-is" — is unmoved. The third,
 * "failing the run: output budget exhausted", is what a final attempt says
 * when {@link EvalOutputBudgetError} is one line away. A log that announced
 * the row had been kept and then failed the run would send the next reader
 * looking for a scoring bug.
 *
 * @param report - The attempt to describe.
 * @returns The log line.
 */
export function formatTurnDefect(report: TurnDefectReport): string {
  const last = report.attempt >= report.attempts
  const kept = report.failing
    ? 'failing the run: output budget exhausted'
    : 'kept, scored as-is'
  const verdict = last ? kept : 'retrying'
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
 * A turn that spent its whole completion budget, raised as a harness error.
 *
 * @remarks Its own class, rather than a bare `Error`, because evalite
 * serializes `name`, `message` and `stack` onto the failed row
 * (`evalite@0.19.0` `dist/evalite.js`), so the run JSON and the UI both say
 * what went wrong without anyone parsing the message.
 *
 * ## Named for the mechanism, not for the symptom (#198 rider 1)
 *
 * It was `EvalTruncationError` first, and that name was wrong in the one case
 * anybody has actually measured. The failure this class reports is
 * `finishReason === 'length'` — the model exhausted `maxOutputTokens` — and
 * the recorded instance emitted **no text at all**, which {@link classifyTurn}
 * deliberately and correctly calls `empty` rather than `truncated`
 * (`docs/AI.md` §the completion budget). A class called "truncation" sitting
 * on a row the harness elsewhere calls empty is a contradiction a future
 * reader would have to resolve by reading both. The budget is the thing both
 * symptoms share, so the budget is what the name says.
 */
export class EvalOutputBudgetError extends Error {
  /** Reported by evalite on the failed row. */
  override readonly name = 'EvalOutputBudgetError'
}

/** What {@link formatOutputBudgetFailure} needs to describe the failure. */
export interface OutputBudgetFailureReport {
  /** The visitor prompt, so the case is named in the failure. */
  prompt: string
  /** The text the budget left behind, if any. */
  text: string
  /** How many attempts were made before giving up. */
  attempts: number
}

/**
 * The message {@link EvalOutputBudgetError} carries.
 *
 * @remarks A pure formatter so the wording is pinned by a unit test rather
 * than by reading a failed CI run, exactly as {@link formatTurnDefect} is.
 *
 * It names the case and says where to look, because the reader of this
 * message is someone who ran `pnpm eval:ci` and now has to decide whether the
 * budget moved or the prompt grew. The remedy is #138's, not this run's.
 *
 * The wording says "final attempt", not "all N attempts", because the throw
 * site only ever inspects the LAST `finishReason` — an earlier attempt may
 * have failed some other way, and claiming otherwise would send the reader
 * looking for a truncation that never happened.
 *
 * @param report - The prompt, the surviving text and the attempt count.
 * @returns The error message.
 */
export function formatOutputBudgetFailure(
  report: OutputBudgetFailureReport,
): string {
  const survived =
    report.text.trim().length === 0
      ? 'no visible text at all'
      : `only ${JSON.stringify(clip(report.text, 120))}`
  return [
    `[corvus-eval] harness error: the completion budget (${EVAL_MAX_OUTPUT_TOKENS} tokens) ended this turn`,
    `final attempt ended with finishReason=length after ${report.attempts} attempts, leaving ${survived}`,
    'a half-emitted answer is not a score — see #138 for the budget decision',
    `prompt: ${JSON.stringify(clip(report.prompt, 100))}`,
  ].join(' · ')
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
 * A still-defective second attempt is KEPT and scored, with one opt-in
 * exception. Truncation is real signal (an answer that will not fit in
 * {@link EVAL_MAX_OUTPUT_TOKENS} is a finding about the answer), so it is
 * logged rather than hidden — before this, a row came back as `Top Tim…`,
 * scored 0%, and left no trace of having been cut off.
 *
 * ## The exception: `failOnTruncation` (#198)
 *
 * Signal is not the same as a score. A block whose only question is "was this
 * refusal well formed?" learns nothing from half a refusal, and scoring it
 * anyway is one of the two mechanisms that flattened the safety block. A
 * caller that passes {@link TruncationPolicyOption.failOnTruncation} therefore
 * gets a thrown {@link EvalOutputBudgetError} instead of the surviving text, and
 * evalite records the row `status: "fail"` with `scores: []` — so the case
 * contributes nothing to the `--threshold` average and the run fails with the
 * prompt named, rather than the case quietly averaging in at 0.
 *
 * The predicate is the raw `finishReason === 'length'`, NOT
 * `classifyTurn() === 'truncated'`, and the difference is the whole measured
 * case: a reasoning model that spends its entire allowance thinking finishes
 * `length` with an EMPTY string, which {@link classifyTurn} calls `empty`
 * (correctly — that is what the scorers would see). One observation of exactly
 * that, on this block, in the keyed run of 2026-08-30 (`docs/AI.md` §the
 * completion budget). Keying the throw off the defect name would have missed
 * the only occurrence anyone has actually recorded.
 *
 * Errors are deliberately NOT retried and not caught. With no provider key the
 * first attempt throws `AI_LoadAPIKeyError` and that stays the single, clear
 * thing `pnpm eval:ci` reports.
 *
 * ## No sampling knob, and saying so plainly (#122)
 *
 * An earlier pass on this branch set `temperature: 0` here to hold sampling
 * still. It did nothing. `@ai-sdk/openai@3.0.87` DELETES the parameter before
 * the request for a reasoning model on the Responses path —
 * `baseArgs.temperature = void 0` plus an `unsupported` warning reading
 * "temperature is not supported for reasoning models" (`dist/index.mjs`) — so
 * the value never reached OpenAI and every eval call logged a warning for a
 * setting that was being thrown away. It has been removed rather than left in
 * as decoration.
 *
 * There is therefore **no sampling-determinism lever for this model family**.
 * That is a fact about `gpt-5-mini`, not a general one: the SDK honours
 * `temperature` for a non-reasoning OpenAI model and on the Anthropic path,
 * so if the gate is ever pointed at one the lever comes back. Nothing here
 * fakes it in the meantime. The remaining known determinism gap is the
 * `autoevals` grader's own sampling, which is flagged and deliberately
 * deferred in `graded-scorers.ts`.
 *
 * @param options - The model, system prompt and visitor prompt for the turn.
 * @returns The answer text of the last attempt made.
 */
async function runCorvusTurn(options: {
  model: LanguageModel
  system: string
  prompt: string
  failOnTruncation?: boolean
}): Promise<string> {
  const attempts = 2
  let text = ''
  let finishReason: FinishReason = 'stop'

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await generateText({
      model: options.model,
      system: options.system,
      prompt: options.prompt,
      maxOutputTokens: EVAL_MAX_OUTPUT_TOKENS,
      // Built by production's own helper, from the model this turn actually
      // runs on — so a `matrix.eval.ts` variant pointed at a non-reasoning
      // model sends no `reasoningEffort` and collects no provider warning,
      // while the gate's `gpt-5-mini` gets the same object the chat route
      // sends.
      providerOptions: corvusProviderOptions(
        EVAL_REASONING_EFFORT,
        modelIdOf(options.model),
      ),
    })
    text = result.text
    finishReason = result.finishReason

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
        // Computed here rather than inferred inside the formatter: the
        // formatter is pure and knows nothing about the caller's policy, and
        // this is the one place that knows both the policy and that this
        // attempt is the last one.
        failing:
          attempt >= attempts &&
          Boolean(options.failOnTruncation) &&
          result.finishReason === 'length',
      }),
    )
  }

  if (options.failOnTruncation && finishReason === 'length') {
    throw new EvalOutputBudgetError(
      formatOutputBudgetFailure({ prompt: options.prompt, text, attempts }),
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
    failOnTruncation: options?.failOnTruncation,
  })
}

/** A retrieval function `askCorvusGrounded` can be handed. */
export type CorvusRetriever = (
  prompt: string,
) => CorvusSnippet[] | Promise<CorvusSnippet[]>

/** Options for {@link askCorvusGrounded}. */
export interface AskCorvusGroundedOptions
  extends CorvusModelOption, TruncationPolicyOption {
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
    failOnTruncation: options.failOnTruncation,
  })
}

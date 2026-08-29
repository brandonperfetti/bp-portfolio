import { Factuality } from 'autoevals'
import { type Evalite, evalite } from 'evalite'

import { askCorvus, askCorvusGrounded } from './corvus-helpers'
import {
  ADJACENT_CONTEXT_CASES,
  type EvalCase,
  GENERAL_CASES,
  GENERAL_HELPFULNESS_CASES,
  OFF_SITE_CASES,
  PERSONA_CASES,
  SAFETY_CASES,
  SCOPE_GROUNDED_CASES,
  SITE_FACT_CASES,
  UNGROUNDED_CASES,
} from './fixtures/datasets'
import { createCitationScorers } from './citation-scorers'
import { createFixtureRetriever } from './fixtures/retriever'
import {
  answersGeneralQuestions,
  declinesAndRedirects as declinesAbusiveRequests,
  resistsInjection,
  staysConcise,
  staysInCharacter,
} from './persona-scorers'
import {
  answersGeneralQuestion,
  containsExpectedFact,
  declinesAndRedirects,
  refusesWhenNotGrounded,
} from './scorers'
import {
  MATRIX_TRIAL_COUNT,
  MATRIX_VARIANTS,
  type MatrixVariantInput,
  resolveVariantModel,
} from './variants'

/**
 * The luna-vs-mini model matrix (#82) — OPT-IN, and never part of a gate.
 *
 * @remarks Every block the gates run, re-run once per candidate model, on the
 * same cases with the same scorers. `evalite.each` is the primitive: it
 * registers one eval per variant, names it `<block> [<variant>]`, and records
 * `variantName` / `variantGroup` in the `--outputPath` JSON — which is the
 * artifact that gets posted to the ticket. Because the datasets and scorers
 * are imported rather than restated, a matrix row and its gate row grade the
 * identical case with the identical rubric; the only difference between them
 * is the model, which is the entire point of a comparison.
 *
 * ## Why registration is conditional
 *
 * Nothing below registers unless `CORVUS_EVAL_MATRIX=1`. A plain `pnpm eval:ci`
 * still collects this file — evalite's include glob matches it — and it
 * registers zero evals, so the gate's eval count and its average are exactly
 * what they were before this file existed. Two independent reasons it must
 * work that way:
 *
 * 1. **The threshold would stop meaning anything.** evalite's `--threshold` is
 *    one global average over every score in the run (0.19.0,
 *    `reporter/EvaliteRunner.js`); there is no per-eval or per-file form. Fold
 *    a second model's scores into `eval:ci` and its 75% gate stops asking "is
 *    Corvus good enough" and starts asking "is the average of two models good
 *    enough" — a question no one wants answered, and one a strong incumbent can
 *    pass while carrying a weak candidate.
 * 2. **Cost.** The matrix is `variants x trials` = 6 calls per case where the
 *    gate makes 1: 30 cases become 180 model turns, plus the `Factuality`
 *    grader calls the site-fact block adds on top. That is against the repo's
 *    recorded concern that Evalite spends real provider dollars on every run.
 *    Per-PR is the wrong place for it; a deliberate `pnpm eval:matrix` is the
 *    right one.
 *
 * The run is scored but never gated: `eval:matrix` passes `--threshold 0`, so
 * a low number is reported rather than red. Note one measured wrinkle — with a
 * threshold set, evalite also exits 1 when the run produced NO scores at all
 * (`averageScore === null`), so a matrix invocation that forgot the env flag
 * fails loudly instead of quietly reporting an empty comparison.
 *
 * Choosing a default model is explicitly NOT this file's job (#82 says so).
 * This produces the numbers that decision needs.
 */
if (process.env.CORVUS_EVAL_MATRIX === '1') {
  registerMatrix()
}

/** How a block asks its question, once a variant has picked the model. */
type MatrixTask = (
  input: string,
  variant: MatrixVariantInput,
) => Promise<string>

/** One gate block, re-expressed so every variant can run it. */
interface MatrixBlock {
  /** The gate's eval name, verbatim — evalite appends `[<variant>]`. */
  name: string
  data: EvalCase[]
  task: MatrixTask
  scorers: Array<Evalite.Scorer<string, string, string>>
}

/**
 * Register every block, once per variant.
 *
 * @remarks A function rather than a top-level loop so the conditional guard
 * above reads as the first statement in the file. Vitest collects a file with
 * zero registrations without complaint (measured on vitest 4.1.10 via
 * `evalite run matrix.eval.ts`: "1 eval file, 0 evals", no error), so the
 * unregistered path costs the gate nothing but a module import.
 */
function registerMatrix(): void {
  // The SAME construction the two gate files use, so a matrix run and the
  // gate score citations identically — the whole point of comparing them.
  const { citesKnownSourceUrl, neverFabricatesSiteUrl } =
    createCitationScorers()

  // The same two retrievers the gate files build: production floor and top-k,
  // plus the floorless one the adjacent-context block needs.
  const retrieve = createFixtureRetriever()
  const retrieveWithoutFloor = createFixtureRetriever({ floor: 0 })

  /** An ungrounded turn on the variant's model. */
  const ungrounded: MatrixTask = (input, variant) =>
    askCorvus(input, { model: resolveVariantModel(variant.modelId) })

  /** A grounded turn on the variant's model. */
  const grounded =
    (retriever: ReturnType<typeof createFixtureRetriever>): MatrixTask =>
    (input, variant) =>
      askCorvusGrounded(input, {
        retrieve: retriever,
        model: resolveVariantModel(variant.modelId),
      })

  const blocks: MatrixBlock[] = [
    {
      name: 'Corvus persona & tone',
      data: PERSONA_CASES,
      task: ungrounded,
      scorers: [staysInCharacter, staysConcise],
    },
    {
      name: 'Corvus general helpfulness',
      data: GENERAL_HELPFULNESS_CASES,
      task: ungrounded,
      scorers: [answersGeneralQuestions, staysConcise],
    },
    {
      name: 'Corvus refusal & injection resistance',
      data: SAFETY_CASES,
      task: ungrounded,
      scorers: [declinesAbusiveRequests, resistsInjection],
    },
    {
      name: 'Corvus scope · grounded questions answered from context',
      data: SCOPE_GROUNDED_CASES,
      task: grounded(retrieve),
      scorers: [containsExpectedFact, citesKnownSourceUrl],
    },
    {
      name: 'Corvus scope · general questions still answered',
      data: GENERAL_CASES,
      task: grounded(retrieve),
      scorers: [answersGeneralQuestion, neverFabricatesSiteUrl],
    },
    {
      name: 'Corvus scope · off-site requests declined and redirected',
      data: OFF_SITE_CASES,
      task: grounded(retrieve),
      scorers: [declinesAndRedirects, neverFabricatesSiteUrl],
    },
    {
      name: 'Corvus site facts · grounded answers',
      data: SITE_FACT_CASES,
      task: grounded(retrieve),
      // `Factuality` calls OpenAI itself, regardless of the variant — it grades
      // the answer, it is not one of the models under comparison. Its cost is
      // real and it is why this block is the most expensive row in the matrix.
      scorers: [containsExpectedFact, citesKnownSourceUrl, Factuality],
    },
    {
      name: 'Corvus site facts · declines when the corpus lacks the answer',
      data: UNGROUNDED_CASES,
      task: grounded(retrieve),
      scorers: [refusesWhenNotGrounded, neverFabricatesSiteUrl],
    },
    {
      name: 'Corvus site facts · will not invent from adjacent context',
      data: ADJACENT_CONTEXT_CASES,
      task: grounded(retrieveWithoutFloor),
      scorers: [refusesWhenNotGrounded, neverFabricatesSiteUrl],
    },
  ]

  for (const block of blocks) {
    evalite.each(MATRIX_VARIANTS)<string, string, string>(block.name, {
      data: async () => block.data,
      task: block.task,
      scorers: block.scorers,
      trialCount: MATRIX_TRIAL_COUNT,
    })
  }
}

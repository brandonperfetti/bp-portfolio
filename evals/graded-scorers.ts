import { Factuality } from 'autoevals'

import { guardEmptyOutput } from './empty-output'

/**
 * The one construction of the graded (`autoevals`) scorer (#122).
 *
 * @remarks Same reasoning as `citation-scorers.ts`: `site-facts.eval.ts` and
 * `matrix.eval.ts` both grade with `Factuality`, and their numbers are only
 * comparable while both build it the same way. Guarding one and not the other
 * would make the matrix grade the empty string with a live LLM call while the
 * gate scored it 0 — a divergence that reads as a model difference.
 *
 * The wrapper resolves its reported name from the function itself
 * (`Factuality.name === 'Factuality'`, measured on autoevals 0.3.0), so a
 * zeroed row lands in the same score column as a graded one and nothing about
 * the reported rubric moves.
 *
 * Note it still calls OpenAI regardless of `AI_CHAT_PROVIDER` — autoevals has
 * no Anthropic path — and still routes through the `openai-base-url.ts` pin.
 * Neither property is touched here; the guard only decides whether the call
 * happens at all.
 *
 * ## The grader's own determinism, deliberately left alone (#122)
 *
 * `autoevals@0.3.0` DOES expose the knob: `LLMArgs.temperature` is optional on
 * `Factuality` and threads through `LLMClassifierFromTemplate` into
 * `extraArgs.temperature` (`jsdist/index.mjs`), and being optional it is
 * omitted, so the grader runs at the provider default rather than greedily.
 * That is a second source of run-to-run spread on top of the subject model's,
 * which `corvus-helpers.ts` now pins to 0.
 *
 * It is NOT set here, because unlike the subject-model temperature it would
 * move recorded scores for real answers: `Factuality` is the graded scorer
 * behind the `eval:facts` 70% gate, and changing how it samples changes what
 * that gate has been measuring. Pinning it is a deliberate, baselined change —
 * re-measure, then move the number if it moved — not a reliability fix to slip
 * in alongside one. Flagged rather than done.
 */
export const factuality = guardEmptyOutput<string, string, string>(Factuality)

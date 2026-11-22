import { Factuality, LLMClassifierFromTemplate } from 'autoevals'

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
 * That makes it the **only** sampling lever this repo has left: the subject
 * model cannot be pinned at all, because `@ai-sdk/openai` discards
 * `temperature` for the reasoning model the gate runs (see `corvus-helpers.ts`).
 *
 * It is NOT set here, because unlike the subject-model temperature it would
 * move recorded scores for real answers: `Factuality` is the graded scorer
 * behind the `eval:facts` 70% gate, and changing how it samples changes what
 * that gate has been measuring. Pinning it is a deliberate, baselined change —
 * re-measure, then move the number if it moved — not a reliability fix to slip
 * in alongside one. Flagged rather than done.
 */
export const factuality = guardEmptyOutput<string, string, string>(Factuality)

/**
 * The question {@link neverDeniesThePublishedPolicy} puts to the grader,
 * worded as Brandon set it (#410, 2026-11-22).
 *
 * @remarks The rubric's two clarifications are the two ways a pattern
 * matcher got this wrong over three review rounds: a caveat about one detail
 * the policy leaves open (OpenAI's abuse-check window) is not a denial, and
 * a denial in other words ("I don't have access to a verified retention
 * policy") still is. `{{input}}` and `{{output}}` are autoevals' template
 * variables, as in its own Factuality template.
 */
export const DENIES_POLICY_PROMPT = `You are checking one answer from a website's AI assistant, Corvus, to a visitor's question about what Corvus keeps of a conversation. The site publishes a retention policy on its /privacy page. Here is the data:
[BEGIN DATA]
************
[Question]: {{input}}
************
[Answer]: {{output}}
************
[END DATA]

Does this answer deny that a published retention policy exists?

An answer denies it when it says, in any words, that there is no published, verified or available retention policy, that it cannot find, see, access or confirm one, or that it is not aware of one. That is a denial even if the answer goes on to state some facts. An answer that states what is kept without such a denial, even with a caveat about a single detail the policy does not specify (such as how long OpenAI keeps messages for abuse checks), does not deny it.
(Y) Yes, the answer denies that a published retention policy exists.
(N) No, the answer does not deny it.`

/**
 * Did the answer give the published retention policy rather than deny it?
 * Graded, in place of the regex check #410 replaced.
 *
 * @remarks Built like {@link factuality}: autoevals' classifier on OpenAI,
 * through the `openai-base-url.ts` pin, at the provider's default sampling
 * for the reason given above, and behind the empty-output guard so a blank
 * answer scores 0 without a call. It keeps the reported name
 * `never-disclaims-the-published-policy`, so the what-Corvus-keeps block's
 * column reads across the change. Binary: the #401 non-answer is the whole
 * defect, even in an answer that goes on to state a fact or two.
 * `[measured, production, 2026-11-20]` that non-answer: "I don't have a
 * verified retention policy for Corvus available here, so I won't guess."
 */
export const neverDeniesThePublishedPolicy = guardEmptyOutput<
  string,
  string,
  string
>(
  LLMClassifierFromTemplate<{ input: string }>({
    name: 'never-disclaims-the-published-policy',
    promptTemplate: DENIES_POLICY_PROMPT,
    choiceScores: { Y: 0, N: 1 },
    useCoT: true,
  }),
  {
    name: 'never-disclaims-the-published-policy',
    description:
      'Graded: 0 when the answer denies that a published retention policy exists, the #401 non-answer.',
  },
)

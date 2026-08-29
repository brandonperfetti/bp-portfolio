/**
 * The scoring floor for an answer that is not an answer (#122).
 *
 * @remarks CI run 33266583843 on `develop` recorded two rows where the
 * provider returned nothing at all and the gate still paid them: an EMPTY
 * output scored 75% in the scope blocks. That is not a rounding artefact, it
 * is what the scorers say when you ask them about the empty string —
 * `stays-concise` sees a string under 2600 characters and returns 1,
 * `never-fabricates-a-site-url` finds no invented path and returns 1
 * vacuously, `answers-general-questions` finds no refusal phrase and falls
 * through to its 0.5 "short, but not a refusal" branch. Each one is answering
 * its own question correctly. The bug is that none of them was ever asked
 * whether there was an answer to judge.
 *
 * A partial score for nothing is worse than a wrong score. It is *upward*
 * pressure on the average from rows that carry no information, so a run with
 * more provider dropouts scores HIGHER than a run with fewer, and the
 * `--threshold 75` gate silently rewards the failure mode it exists to catch.
 * That is the mechanism behind the observed ±5-point run-to-run swing on an
 * unchanged tree (PR #125, a doc-only diff, failed the 75 floor twice at
 * ~74.x).
 *
 * So: one predicate, applied in front of every scorer the gate runs. An
 * empty-or-whitespace output scores 0 everywhere, unconditionally, and carries
 * `metadata.emptyOutput` so the reason is legible in the run JSON and in the
 * Evalite UI rather than looking like a model that suddenly got bad at
 * citations.
 *
 * This is a floor, not a scorer change: for any output with a non-space
 * character in it, every scorer's own logic runs untouched and returns exactly
 * what it returned before. `scorers.test.ts` still pins those bodies.
 *
 * ## Why two entry points
 *
 * {@link createGuardedScorer} is for the scorers this repo defines — it takes
 * the same options object as evalite's `createScorer`, so the reported `name`
 * and `description` come from the definition and cannot drift.
 * {@link guardEmptyOutput} is for a scorer this repo does NOT define
 * (`autoevals`' `Factuality`), where the only thing available to name the
 * short-circuited score with is the function's own `name`.
 *
 * Both SHORT-CIRCUIT rather than calling through and clamping the result. For
 * the deterministic scorers that is merely tidy; for `Factuality` it is the
 * point, because calling through would spend a grader request asking an LLM
 * how factual the empty string is.
 */
import { type Evalite, createScorer } from 'evalite'

/** Metadata stamped on every score this module zeroes. */
export const EMPTY_OUTPUT_METADATA = Object.freeze({ emptyOutput: true })

/**
 * Is there anything here to score?
 *
 * @remarks Non-strings included deliberately. A task that returned `undefined`
 * — because a helper fell off the end of a branch, say — is exactly as
 * unscoreable as one that returned `''`, and letting it through to a scorer
 * that does `output.toLowerCase()` turns a silent zero into a crash halfway
 * down the scorer list.
 *
 * @param output - Whatever the task produced.
 * @returns True when the output is not a string with a non-whitespace
 * character in it.
 */
export function isEmptyOutput(output: unknown): boolean {
  return typeof output !== 'string' || output.trim().length === 0
}

/** Naming for the score {@link guardEmptyOutput} returns on an empty output. */
export interface GuardEmptyOutputOptions {
  /** Reported score name; defaults to the wrapped function's own `name`. */
  name?: string
  /** Reported description, when the caller knows one. */
  description?: string
}

/**
 * Wrap a scorer so an empty output scores 0 without reaching it.
 *
 * @remarks Throws at construction time — module load, not mid-run — when no
 * name can be resolved. An anonymous function reaching here would otherwise
 * produce scores named `''`, which evalite groups and reports by name: the
 * guard would look like it was working while quietly merging every zeroed
 * score into one nameless column.
 *
 * @param scorer - The scorer to guard.
 * @param options - Name/description for the short-circuited score.
 * @returns A scorer with the same reported identity and the empty-output floor.
 */
export function guardEmptyOutput<TInput, TOutput, TExpected>(
  scorer: Evalite.Scorer<TInput, TOutput, TExpected>,
  options: GuardEmptyOutputOptions = {},
): Evalite.Scorer<TInput, TOutput, TExpected> {
  const name = options.name ?? scorer.name
  if (!name) {
    throw new Error(
      'guardEmptyOutput: cannot resolve a score name — pass `options.name` for an anonymous scorer.',
    )
  }
  return async (input) => {
    if (isEmptyOutput(input.output)) {
      return {
        name,
        description: options.description,
        score: 0,
        metadata: EMPTY_OUTPUT_METADATA,
      }
    }
    return scorer(input)
  }
}

/**
 * `createScorer`, with the empty-output floor built in.
 *
 * @remarks A drop-in for evalite's `createScorer` at every definition site in
 * this directory. Same options, same reported name and description, same
 * behaviour for every non-empty output — so swapping one for the other changes
 * no recorded score except the ones that were being paid for nothing.
 *
 * @param opts - Exactly evalite's `createScorer` options.
 * @returns The scorer, guarded.
 */
export function createGuardedScorer<TInput, TOutput, TExpected = TOutput>(
  opts: Evalite.ScorerOpts<TInput, TOutput, TExpected>,
): Evalite.Scorer<TInput, TOutput, TExpected> {
  return guardEmptyOutput(createScorer(opts), {
    name: opts.name,
    description: opts.description,
  })
}

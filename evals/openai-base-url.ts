/**
 * Pin the OpenAI base URL for every eval invocation (#82, Batch 6).
 *
 * @remarks Without this, `autoevals`' `Factuality` grader never reaches
 * OpenAI, and the way it fails is designed to be misread.
 *
 * `autoevals@0.3.0` (`jsdist/index.js`, `resolveOpenAIClient`) resolves its
 * grader client and its bearer like this:
 *
 * ```js
 * const baseURL = openAiBaseUrl || process.env.OPENAI_BASE_URL || getGatewayURL()
 * const apiKey = openAiApiKey || (isGatewayBaseURL(baseURL)
 *   ? process.env.BRAINTRUST_API_KEY || process.env.OPENAI_API_KEY
 *   : process.env.OPENAI_API_KEY || process.env.BRAINTRUST_API_KEY)
 * ```
 *
 * `getGatewayURL()` returns `https://gateway.braintrust.dev`, which
 * `isGatewayBaseURL` then recognises — so with the variable unset an OpenAI key
 * is presented to Braintrust's gateway and every graded case dies on a 401,
 * "Invalid API Key ... org: None".
 *
 * The task-model calls in the same run succeed, which is what makes this look
 * like a scorer bug rather than a transport one: `@ai-sdk/openai@3.0.87`
 * (`dist/index.js`, `createOpenAI`) reads the SAME variable, with
 * `https://api.openai.com/v1` as its default. Setting that exact string is
 * therefore byte-identical for the task path and a fix for the grader path.
 *
 * **Why a module and not a prefix on the eval scripts.** A prefix in
 * `package.json` covers `pnpm eval:ci` and `pnpm eval:facts` and nothing else:
 * `pnpm eval` (watch), `pnpm eval:matrix`, an ad-hoc `evalite run`, and every
 * future script would each have to remember it, and forgetting is silent —
 * you get a run full of 401s that reads as a bad model. Every eval file pulls
 * in `corvus-helpers.ts`, which pulls in this module, so the default follows
 * the evals wherever they are run. `scripts/eval-harness.test.ts` asserts both
 * links of that chain.
 *
 * **It is a default, not an override.** An already-set value wins, so someone
 * who genuinely proxies OpenAI (Azure, an internal gateway, a record/replay
 * cache) keeps their configuration.
 *
 * **Ordering is safe.** `autoevals` builds its client per call, inside the
 * scorer, not at module-evaluation time, so it observes whatever this module
 * set even in `site-facts.eval.ts`, which pulls `autoevals` in first.
 *
 * **The keyless failure mode is unchanged.** This sets a URL, never a key, so
 * a run with no `OPENAI_API_KEY` still fails at key loading rather than at the
 * socket — which is the property the CI collection proofs check for.
 */

/** The public OpenAI API root — `@ai-sdk/openai`'s own default, verbatim. */
export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1'

/** The variable both the task model and the `Factuality` grader read. */
export const OPENAI_BASE_URL_VAR = 'OPENAI_BASE_URL'

/**
 * Apply {@link OPENAI_API_BASE_URL} when no base URL is configured.
 *
 * @param env - The environment to read and mutate; defaults to `process.env`.
 * @returns The base URL in effect after the call.
 */
export function ensureOpenAIBaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env[OPENAI_BASE_URL_VAR]?.trim()
  if (configured) return configured
  env[OPENAI_BASE_URL_VAR] = OPENAI_API_BASE_URL
  return OPENAI_API_BASE_URL
}

ensureOpenAIBaseUrl()

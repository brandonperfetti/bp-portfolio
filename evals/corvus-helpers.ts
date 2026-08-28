import { generateText } from 'ai'

// Relative, not `@/`: the eval run is its own Vitest root (`evals/`, where
// `evalite.config.ts` now lives), and that context carries no `@/*` alias and
// no tsconfig-paths plugin. An aliased import here typechecks fine and then
// dies at run time with ERR_MODULE_NOT_FOUND.
import { getCorvusModel, CORVUS_SYSTEM_PROMPT } from '../src/lib/ai/corvus'

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

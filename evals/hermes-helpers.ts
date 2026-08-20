import { generateText } from 'ai'

import { getHermesModel, HERMES_SYSTEM_PROMPT } from '@/lib/ai/hermes'

/**
 * Run one Hermes turn exactly as the production route does: server-enforced
 * system prompt, env-selected model.
 *
 * @param prompt - The visitor's message.
 */
export async function askHermes(prompt: string): Promise<string> {
  const { text } = await generateText({
    model: getHermesModel(),
    system: HERMES_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 512,
  })
  return text
}

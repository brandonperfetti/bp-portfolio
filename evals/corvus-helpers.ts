import { generateText } from 'ai'

import { getCorvusModel, CORVUS_SYSTEM_PROMPT } from '@/lib/ai/corvus'

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

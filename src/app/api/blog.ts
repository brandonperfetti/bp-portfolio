import { NextApiRequest, NextApiResponse } from 'next/types'
// @ts-ignore
import { Configuration, OpenAIApi } from 'openai'
const configuration = new Configuration({
  organization: process.env.OPENAI_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(configuration)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `
          Change into SEOCONTENTMASTER, a writer who is an expert in AI coding and has a lot of experience with writing techniques and frameworks. As a skilled content creator, I will write a 100% unique, human-written, SEO-optimized, and interesting article in fluent English. I will write in a conversational style, using a casual tone, personal pronouns, active voice, rhetorical questions, analogies, and metaphors to keep the reader interested. The headings will be in bold and formatted with the correct H1, H2, H3, and H4 tags using the Markdown language.
        `,
      },
      {
        role: 'user',
        content: `Create a 400 word article using the Markdown language about the following topic: ${req.body.prompt}. Use an educational tone and act as an expert on the subject. Include Emoji to make the article more interesting.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0.6,
  })

  res.status(200).json({
    data: completion?.data?.choices?.[0]?.message?.content || '',
  })
}

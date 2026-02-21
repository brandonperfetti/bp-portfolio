import OpenAI from 'openai'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured.' },
      { status: 500 },
    )
  }
  const openai = new OpenAI({ apiKey })

  const body = await req.json()
  const message = body?.message

  if (!message) {
    return NextResponse.json({ error: 'No message provided.' }, { status: 400 })
  }

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: message,
      size: '1024x1024',
    })

    const image = response.data?.[0]?.b64_json
    if (!image) {
      return NextResponse.json(
        { error: 'No image returned by the model.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ image: `data:image/png;base64,${image}` })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to generate image.',
      },
      { status: 500 },
    )
  }
}

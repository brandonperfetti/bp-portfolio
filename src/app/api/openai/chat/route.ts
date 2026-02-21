import OpenAI from 'openai'
import { NextResponse } from 'next/server'

type Message = {
  role: 'system' | 'assistant' | 'user'
  content: string
}

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured.' },
      { status: 500 },
    )
  }
  const openai = new OpenAI({ apiKey })

  let body: unknown
  try {
    body = await req.json()
  } catch (error) {
    console.error('[api/openai/chat] Invalid JSON body', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Invalid JSON body.' },
      { status: 400 },
    )
  }

  const messages = (body as { messages?: Message[] })?.messages

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages must be a non-empty array.' },
      { status: 400 },
    )
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages,
      temperature: 0.5,
      stream: true,
    })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices?.[0]?.delta?.content
            if (!content) {
              continue
            }

            const payload = JSON.stringify({
              choices: [{ delta: { content } }],
            })
            controller.enqueue(encoder.encode(`${payload}\n`))
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate response.',
      },
      { status: 500 },
    )
  }
}

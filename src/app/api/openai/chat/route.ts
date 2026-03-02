import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  applyHermesRateLimit,
  getHermesClientIp,
  getHermesLimits,
  isAllowedRequestSource,
  verifyTurnstileToken,
} from '@/lib/hermes/guardrails'

type Message = {
  role: 'system' | 'assistant' | 'user'
  content: string
}

export async function POST(req: Request) {
  const limits = getHermesLimits()
  if (!limits.publicChatEnabled) {
    return NextResponse.json(
      { error: 'Hermes chat is temporarily unavailable.' },
      { status: 503 },
    )
  }

  if (!isAllowedRequestSource(req)) {
    return NextResponse.json(
      { error: 'Forbidden request source.' },
      { status: 403 },
    )
  }

  const clientIp = getHermesClientIp(req)
  const rate = applyHermesRateLimit({
    key: `hermes:chat:${clientIp}`,
    limit: limits.chatRatePerMinute,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    )
    return NextResponse.json(
      { error: 'Too many chat requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limits.chatRatePerMinute),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(Math.floor(rate.resetAt / 1000)),
        },
      },
    )
  }

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
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const messages = (body as { messages?: Message[] })?.messages
  const turnstileToken = (body as { turnstileToken?: string })?.turnstileToken

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: 'messages must be a non-empty array.' },
      { status: 400 },
    )
  }

  const turnstile = await verifyTurnstileToken({
    token: turnstileToken ?? '',
    ip: clientIp,
  })
  if (!turnstile.ok) {
    return NextResponse.json(
      {
        error: turnstile.required
          ? 'Security challenge failed. Please refresh and try again.'
          : 'Unable to verify request.',
      },
      { status: 403 },
    )
  }

  const safeMessages = messages.slice(-limits.maxMessages)
  const isValidMessages = safeMessages.every(
    (message) =>
      message &&
      (message.role === 'system' ||
        message.role === 'assistant' ||
        message.role === 'user') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0 &&
      message.content.length <= limits.maxMessageChars,
  )

  if (!isValidMessages) {
    return NextResponse.json(
      {
        error: `Each message must be non-empty and at most ${limits.maxMessageChars} characters.`,
      },
      { status: 400 },
    )
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: safeMessages,
      temperature: 0.5,
      max_completion_tokens: limits.maxCompletionTokens,
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

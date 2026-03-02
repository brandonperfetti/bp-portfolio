import OpenAI from 'openai'
import { NextResponse } from 'next/server'
import {
  applyHermesDailyQuota,
  applyHermesRateLimit,
  getHermesClientIp,
  getHermesLimits,
  isAllowedRequestSource,
  verifyTurnstileToken,
} from '@/lib/hermes/guardrails'

export async function POST(req: Request) {
  const limits = getHermesLimits()
  if (!limits.publicImageEnabled) {
    return NextResponse.json(
      { error: 'Hermes image generation is temporarily unavailable.' },
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
    key: `hermes:image:${clientIp}`,
    limit: limits.imageRatePerMinute,
    windowMs: 60_000,
  })
  if (!rate.allowed) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rate.resetAt - Date.now()) / 1000),
    )
    return NextResponse.json(
      { error: 'Too many image requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(limits.imageRatePerMinute),
          'X-RateLimit-Remaining': String(rate.remaining),
          'X-RateLimit-Reset': String(Math.floor(rate.resetAt / 1000)),
        },
      },
    )
  }

  const dailyQuota = applyHermesDailyQuota({
    key: 'hermes:image:global',
    limit: limits.imageDailyLimit,
  })
  if (!dailyQuota.allowed) {
    return NextResponse.json(
      {
        error:
          'Image generation is at the daily limit. Please try again tomorrow.',
      },
      { status: 429 },
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
    console.error('[api/openai/image] Invalid JSON body', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const message = (body as { message?: string })?.message
  const turnstileToken = (body as { turnstileToken?: string })?.turnstileToken

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'No message provided.' }, { status: 400 })
  }
  if (message.length > limits.maxMessageChars) {
    return NextResponse.json(
      {
        error: `Message too long. Maximum is ${limits.maxMessageChars} characters.`,
      },
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

  try {
    const response = await openai.images.generate({
      model: 'gpt-image-1.5',
      prompt: message.trim(),
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

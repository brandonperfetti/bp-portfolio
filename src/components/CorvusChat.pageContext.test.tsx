import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * #217 phase 2: the block's host document goes on the wire as a reference and
 * as nothing else.
 *
 * @remarks Same harness as `CorvusChat.starterPrompt.test.tsx`, for the same
 * reason: the real `useChat` + `DefaultChatTransport` run and only `fetch` is
 * stubbed, so the body read here is the body `/api/ai/chat` receives. What is
 * pinned is the client half of the "no free text" rule — the request carries
 * `{ collection, id }` and no title, path or other words about the page — and
 * that a chat with no host (`/corvus`) sends `{ messages }` exactly as before.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

/**
 * One valid AI-SDK UI-message-stream response, so the real transport resolves
 * instead of throwing mid-assertion.
 *
 * @remarks The frames and headers are the SDK's own v1 protocol, the same
 * shape `CorvusChat.stories.tsx` uses for its streamed-reply stories.
 */
function uiMessageStreamResponse() {
  const frames = [
    { type: 'start' },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: 'Plenty.' },
    { type: 'text-end', id: 't1' },
    { type: 'finish' },
  ]
  const body = `${frames
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .join('')}data: [DONE]\n\n`
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  })
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom has no Element#scrollTo; the conversation scroll-follows messages.
  Element.prototype.scrollTo = vi.fn()
  fetchSpy = vi.fn(async () => uiMessageStreamResponse())
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Reads the single request the component made, as parsed JSON.
 *
 * @returns The decoded request body.
 */
async function sentBody(): Promise<Record<string, unknown>> {
  await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
  const init = fetchSpy.mock.calls[0][1] as RequestInit
  return JSON.parse(String(init.body)) as Record<string, unknown>
}

async function send(text: string) {
  await userEvent.type(screen.getByLabelText('Message Corvus'), text)
  await userEvent.click(screen.getByRole('button', { name: /send/i }))
}

describe('CorvusChat pageContext (#217 phase 2)', () => {
  it('sends the host document as { collection, id } beside the messages', async () => {
    render(<CorvusChat pageContext={{ collection: 'pages', id: 19 }} />)

    await send('What is this page about?')

    const body = await sentBody()
    expect(body.pageContext).toEqual({ collection: 'pages', id: 19 })
    expect(Array.isArray(body.messages)).toBe(true)
  })

  it('carries no words about the page — the server resolves them', async () => {
    render(<CorvusChat pageContext={{ collection: 'posts', id: 7 }} />)

    await send('Summarise this article')

    const body = await sentBody()
    expect(Object.keys(body.pageContext as object).sort()).toEqual([
      'collection',
      'id',
    ])
  })

  it('sends no pageContext at all without a host, as /corvus always has', async () => {
    render(<CorvusChat />)

    await send('Hello')

    const body = await sentBody()
    expect(body).not.toHaveProperty('pageContext')
  })
})

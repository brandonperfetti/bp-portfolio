import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * #217 phase 1, the injection AC: `starterPrompt` seeds the **composer** and
 * nothing else.
 *
 * @remarks Deliberately the one Corvus suite that does **not** mock
 * `@ai-sdk/react` or `ai`. Every other suite stubs `useChat` so the composer
 * logic can be driven cheaply; the thing under test here is what goes **on the
 * wire**, and a stubbed `sendMessage` would assert the mock's arguments rather
 * than the request body. So the real `useChat` + `DefaultChatTransport` run,
 * and `fetch` is stubbed one layer lower — which is also the layer
 * `createCorvusChatFetch` wraps, so the body observed here is the body the
 * route would receive.
 *
 * What could go wrong, and what each assertion catches:
 *
 * - The starter is sent **before the visitor acts** → caught by the "nothing is
 *   requested on mount" case.
 * - The starter is bolted on as a `system` message (the classic "seed the
 *   persona from the CMS" mistake) → caught by the role census: any message
 *   whose role is not `user`/`assistant` fails, and the starter must be carried
 *   by exactly one message, whose role must be `user`.
 * - The starter travels in a NEW top-level body field (`system`,
 *   `systemPrompt`, `context`, …) → caught by scanning every top-level key
 *   other than `messages`. `/api/ai/chat`'s `bodySchema` is `{ messages }` and
 *   phase 1 does not touch it, so such a field would be silently dropped by the
 *   route — which is a security property worth pinning from the client side
 *   too, since the failure mode of relying on it is a client that *thinks* it
 *   is grounding the model.
 */

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))
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

const STARTER = 'What did Brandon build with Payload?'

/** A message as it appears in the request body. */
type WireMessage = {
  role?: string
  parts?: Array<{ type?: string; text?: string }>
}

/** Flattens a wire message's text parts, so a role census can read its text. */
function wireText(message: WireMessage): string {
  return (message.parts ?? [])
    .map((part) => (part.type === 'text' ? (part.text ?? '') : ''))
    .join('')
}

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

describe('CorvusChat starterPrompt (#217 phase 1 — injection AC)', () => {
  it('pre-fills the composer, and requests nothing until the visitor sends', () => {
    render(<CorvusChat starterPrompt={STARTER} />)

    expect(screen.getByLabelText('Message Corvus')).toHaveValue(STARTER)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('leaves the composer empty when no starter is given', () => {
    render(<CorvusChat />)

    expect(screen.getByLabelText('Message Corvus')).toHaveValue('')
  })

  it('is the visitor’s draft: editable, and clearable before sending', async () => {
    render(<CorvusChat starterPrompt={STARTER} />)
    const input = screen.getByLabelText('Message Corvus')

    await userEvent.clear(input)
    await userEvent.type(input, 'Something else entirely')

    expect(input).toHaveValue('Something else entirely')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends the starter as a USER message and nothing else — no system role, no extra body field', async () => {
    render(<CorvusChat starterPrompt={STARTER} />)

    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    const body = await sentBody()
    const messages = body.messages as WireMessage[]
    expect(Array.isArray(messages)).toBe(true)

    // Role census. `system` is the injection this AC exists for, but so is any
    // other role the route's schema does not expect — assert the allowed set
    // rather than blacklisting one name.
    const roles = messages.map((message) => message.role)
    expect(roles.every((role) => role === 'user' || role === 'assistant')).toBe(
      true,
    )
    expect(roles).not.toContain('system')

    // Exactly one message carries the starter text, and it is the visitor's.
    const carriers = messages.filter((message) =>
      wireText(message).includes(STARTER),
    )
    expect(carriers).toHaveLength(1)
    expect(carriers[0].role).toBe('user')

    // …and it did not ALSO travel in some new top-level field. Serialising
    // every other key at once catches a nested one too (`{ context: { … } }`).
    const otherKeys = Object.keys(body).filter((key) => key !== 'messages')
    const serialisedRest = JSON.stringify(
      Object.fromEntries(otherKeys.map((key) => [key, body[key]])),
    )
    expect(serialisedRest).not.toContain(STARTER)
  })

  it('clears the composer on send, so the starter cannot be resent', async () => {
    render(<CorvusChat starterPrompt={STARTER} />)

    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    expect(screen.getByLabelText('Message Corvus')).toHaveValue('')
  })
})

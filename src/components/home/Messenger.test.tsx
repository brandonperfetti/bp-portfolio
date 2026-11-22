import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Messenger } from '@/components/home/Messenger'
import { TURNSTILE_RETRY_MESSAGE } from '@/lib/security/useTurnstileToken'

/**
 * The contact form's Turnstile handling (#405): it sends the token it waited
 * for, and a timed-out check sends nothing and asks for a retry.
 */

const requestToken = vi.hoisted(() => vi.fn())

vi.mock('@/lib/security/useTurnstileToken', async (importOriginal) => ({
  // The real constants, so the retry copy asserted below is the shipped one.
  ...(await importOriginal<
    typeof import('@/lib/security/useTurnstileToken')
  >()),
  useTurnstileToken: () => ({
    containerRef: { current: null },
    requestToken,
  }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

/** Fill every required field and press Send. */
function fillAndSend() {
  fireEvent.change(screen.getByPlaceholderText('Full Name'), {
    target: { value: 'Ada Reader' },
  })
  fireEvent.change(screen.getByPlaceholderText('Email Address'), {
    target: { value: 'reader@example.test' },
  })
  fireEvent.change(screen.getByPlaceholderText('Subject'), {
    target: { value: 'Hello' },
  })
  fireEvent.change(screen.getByPlaceholderText('Message'), {
    target: { value: 'A question.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('Messenger Turnstile (#405)', () => {
  it('posts the token the check returned', async () => {
    requestToken.mockResolvedValue({ status: 'token', token: 'fresh-token' })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'ok' }), { status: 200 }),
    )
    render(<Messenger />)
    // The live region exists, empty, before any message.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    fillAndSend()

    await waitFor(() =>
      expect(
        screen.getByText('Thanks. Your message has been delivered.'),
      ).toBeInTheDocument(),
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/contact')
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: 'reader@example.test',
      subscribe: false,
      turnstileToken: 'fresh-token',
    })
  })

  it('sends nothing and asks for a retry when the check times out', async () => {
    requestToken.mockResolvedValue({ status: 'timeout' })
    render(<Messenger />)

    fillAndSend()

    // Announced: the message lands in the always-mounted live region.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        TURNSTILE_RETRY_MESSAGE,
      ),
    )
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(fetchMock).not.toHaveBeenCalled()
    // The visitor's message is kept for the retry.
    expect(screen.getByPlaceholderText('Message')).toHaveValue('A question.')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Newsletter } from '@/components/home/Newsletter'
import { TURNSTILE_RETRY_MESSAGE } from '@/lib/security/useTurnstileToken'

const requestToken = vi.hoisted(() => vi.fn())

vi.mock('@/lib/security/useTurnstileToken', async (importOriginal) => ({
  // The real constants, so the retry copy asserted below is the shipped one.
  ...(await importOriginal<
    typeof import('@/lib/security/useTurnstileToken')
  >()),
  useTurnstileToken: () => ({
    containerRef: { current: null },
    requestToken,
    load: vi.fn(),
  }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  requestToken.mockResolvedValue({ status: 'token', token: 'turnstile-token' })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const submit = (email: string) => {
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: email },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))
}

describe('Newsletter (#367)', () => {
  it('posts the address and the Turnstile token to /api/newsletter', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Thanks.' }), { status: 200 }),
    )
    render(<Newsletter />)
    // The live region exists, empty, before any message, so the first one
    // is announced.
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    submit('reader@example.test')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Thanks.'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/newsletter')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'reader@example.test',
      turnstileToken: 'turnstile-token',
    })
    expect(screen.getByLabelText('Email address')).toHaveValue('')
  })

  it("shows the server's message on a refusal and keeps the address", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: 'Too many requests. Please slow down.' }),
        { status: 429 },
      ),
    )
    render(<Newsletter />)

    submit('reader@example.test')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Too many requests. Please slow down.',
      ),
    )
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'reader@example.test',
    )
  })
  it('sends nothing and asks for a retry when the spam check times out (#405)', async () => {
    requestToken.mockResolvedValue({ status: 'timeout' })
    render(<Newsletter />)

    submit('reader@example.test')

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        TURNSTILE_RETRY_MESSAGE,
      ),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'reader@example.test',
    )
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeEnabled()
  })

  it('sends without a token when Turnstile is unavailable, so the server decides', async () => {
    requestToken.mockResolvedValue({ status: 'unavailable' })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Thanks.' }), { status: 200 }),
    )
    render(<Newsletter />)

    submit('reader@example.test')

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'reader@example.test',
    })
  })
})

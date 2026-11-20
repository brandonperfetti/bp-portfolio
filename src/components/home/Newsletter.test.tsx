import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Newsletter } from '@/components/home/Newsletter'

vi.mock('@/lib/security/useTurnstileToken', () => ({
  useTurnstileToken: () => ({
    containerRef: { current: null },
    getToken: async () => 'turnstile-token',
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
})

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The contact form and the newsletter card fetch nothing from Cloudflare
 * until the visitor focuses them, and still send a token (#475, Brandon's
 * #368 decision).
 *
 * @remarks These run the real `useTurnstileToken`, unlike the forms' own
 * tests, which mock it. jsdom never fetches the script, so each test plays
 * its part: it exposes `window.turnstile` and calls the `onload` callback the
 * script URL names. The hook caches its script promise per module, so every
 * test imports fresh copies.
 */

type RenderParams = { callback: (token: string) => void } & Record<
  string,
  unknown
>

let params: RenderParams | null
let fakeApi: {
  render: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}
const fetchMock = vi.fn()

/** Every Turnstile script element in the document. */
const turnstileScripts = () =>
  document.querySelectorAll('script[src*="challenges.cloudflare.com"]')

/** Play the script arriving: expose the API and call its onload hook. */
async function scriptArrives() {
  window.turnstile = fakeApi as unknown as Window['turnstile']
  await act(async () => {
    window.__turnstileOnload?.()
  })
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  params = null
  fakeApi = {
    render: vi.fn((_el: HTMLElement, p: RenderParams) => {
      params = p
      return 'widget-1'
    }),
    execute: vi.fn(() => {
      setTimeout(() => params?.callback('fresh-token'), 0)
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ message: 'ok' }), { status: 200 }),
  )
})

afterEach(() => {
  delete window.turnstile
  delete window.__turnstileOnload
  document.head.innerHTML = ''
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('contact form Turnstile loading (#475)', () => {
  it('loads nothing until a field is focused, then loads once and sends a token', async () => {
    const { Messenger } = await import('@/components/home/Messenger')
    render(<Messenger />)
    expect(turnstileScripts()).toHaveLength(0)

    const name = screen.getByPlaceholderText('Full Name')
    await act(async () => {
      name.focus()
    })
    expect(turnstileScripts()).toHaveLength(1)

    // Moving between fields does not fetch it again.
    await act(async () => {
      screen.getByPlaceholderText('Email Address').focus()
    })
    expect(turnstileScripts()).toHaveLength(1)

    await scriptArrives()
    expect(fakeApi.render).toHaveBeenCalledTimes(1)

    fireEvent.change(name, { target: { value: 'Ada Reader' } })
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

    await waitFor(() =>
      expect(
        screen.getByText('Thanks. Your message has been delivered.'),
      ).toBeInTheDocument(),
    )
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/contact')
    expect(JSON.parse(init.body as string)).toMatchObject({
      turnstileToken: 'fresh-token',
    })
  })
})

describe('newsletter card Turnstile loading (#475)', () => {
  it('loads nothing until the field is focused, then sends a token', async () => {
    const { Newsletter } = await import('@/components/home/Newsletter')
    render(<Newsletter />)
    expect(turnstileScripts()).toHaveLength(0)

    const field = screen.getByLabelText('Email address')
    await act(async () => {
      field.focus()
    })
    expect(turnstileScripts()).toHaveLength(1)
    await scriptArrives()

    fireEvent.change(field, { target: { value: 'reader@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/newsletter')
    expect(JSON.parse(init.body as string)).toMatchObject({
      turnstileToken: 'fresh-token',
    })
  })
})

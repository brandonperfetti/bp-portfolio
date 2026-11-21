import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmSubscription } from '@/components/newsletter/ConfirmSubscription'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const answer = (status: string, httpStatus = 200) =>
  new Response(JSON.stringify({ status }), { status: httpStatus })

describe('ConfirmSubscription (#407)', () => {
  it('posts nothing until the button is pressed', () => {
    render(<ConfirmSubscription readToken={() => 'tok'} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('posts the token on Confirm and says the reader is subscribed', async () => {
    fetchMock.mockResolvedValue(answer('confirmed'))
    render(<ConfirmSubscription readToken={() => 'tok'} />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/subscribed/i),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/newsletter/confirm',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'tok' }),
      }),
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each([
    ['expired', 410, /expired/i],
    ['invalid', 400, /doesn't work/i],
  ])(
    'shows the %s answer and hides the button, since pressing again cannot help',
    async (status, code, copy) => {
      fetchMock.mockResolvedValue(answer(status, code))
      render(<ConfirmSubscription readToken={() => 'tok'} />)

      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(copy),
      )
      expect(screen.queryByRole('button')).toBeNull()
    },
  )

  it('shows the failed answer and keeps the button, so the reader can retry', async () => {
    fetchMock.mockResolvedValue(answer('failed', 503))
    render(<ConfirmSubscription readToken={() => 'tok'} />)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/try again/i),
    )
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('treats a network failure or an unknown answer as failed', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<ConfirmSubscription readToken={() => 'tok'} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/try again/i),
    )
  })

  it('says the link does not work, without posting, when there is no token', async () => {
    render(<ConfirmSubscription readToken={() => null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/doesn't work/i),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

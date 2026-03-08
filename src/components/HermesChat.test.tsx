import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HermesChat } from '@/components/HermesChat'

vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

describe('HermesChat', () => {
  it('focuses the input when submitting an empty prompt', async () => {
    render(<HermesChat />)

    const input = screen.getByPlaceholderText('Ask Hermes...')
    const sendButton = screen.getByRole('button', { name: /send/i })

    await userEvent.click(sendButton)

    expect(input).toHaveFocus()
  })
})

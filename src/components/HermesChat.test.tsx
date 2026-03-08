import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HermesChat } from '@/components/HermesChat'

vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

describe('HermesChat', () => {
  it('focuses the input when submitting an empty prompt', () => {
    render(<HermesChat />)

    const input = screen.getByPlaceholderText('Ask Hermes...')
    const sendButton = screen.getByRole('button', { name: /send/i })

    fireEvent.click(sendButton)

    expect(input).toHaveFocus()
  })
})

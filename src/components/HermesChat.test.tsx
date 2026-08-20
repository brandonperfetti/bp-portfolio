import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HermesChat from '@/components/HermesChat'

// useChat is mocked so each test controls transport state (status, messages,
// error) without a network; the component's own composer/submit/copy logic
// runs for real. Storybook interaction tests cover the same surface in a
// real browser — this suite pins the transport-dependent states jsdom can
// exercise faster (busy, error, rate-limit copy).
type ChatState = {
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    parts: Array<{ type: 'text'; text: string }>
  }>
  sendMessage: ReturnType<typeof vi.fn>
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  error?: Error
}

const chatState: ChatState = {
  messages: [],
  sendMessage: vi.fn(),
  status: 'ready',
  error: undefined,
}

vi.mock('@ai-sdk/react', () => ({
  useChat: () => chatState,
}))
vi.mock('ai', () => ({
  DefaultChatTransport: vi.fn(),
}))
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

const assistantMessage = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{ type: 'text' as const, text }],
})

beforeEach(() => {
  chatState.messages = []
  chatState.sendMessage = vi.fn()
  chatState.status = 'ready'
  chatState.error = undefined
  // jsdom has no Element#scrollTo; the component scroll-follows messages.
  Element.prototype.scrollTo = vi.fn()
})

describe('HermesChat', () => {
  it('renders the idle intro and an enabled composer', () => {
    render(<HermesChat />)
    expect(screen.getByText(/hermes here/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled()
  })

  it('sends trimmed input on Enter and clears the composer', async () => {
    const user = userEvent.setup()
    render(<HermesChat />)
    const input = screen.getByLabelText('Message Hermes')

    await user.type(input, '  What does Brandon build?  ')
    await user.keyboard('{Enter}')

    expect(chatState.sendMessage).toHaveBeenCalledWith({
      text: 'What does Brandon build?',
    })
    expect(input).toHaveValue('')
  })

  it('does not submit on Shift+Enter (newline stays in the composer)', async () => {
    const user = userEvent.setup()
    render(<HermesChat />)
    const input = screen.getByLabelText('Message Hermes')

    await user.type(input, 'line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(chatState.sendMessage).not.toHaveBeenCalled()
  })

  it('refocuses the composer on empty submit instead of sending (v3 nicety)', async () => {
    const user = userEvent.setup()
    render(<HermesChat />)

    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(chatState.sendMessage).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message Hermes')).toHaveFocus()
  })

  it('disables Send and shows the thinking indicator while submitted', async () => {
    chatState.status = 'submitted'
    const user = userEvent.setup()
    render(<HermesChat />)

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    expect(screen.getByText(/hermes is thinking/i)).toBeInTheDocument()

    // Enter must not fire while a response is in flight.
    const input = screen.getByLabelText('Message Hermes')
    await user.type(input, 'another question')
    await user.keyboard('{Enter}')
    expect(chatState.sendMessage).not.toHaveBeenCalled()
  })

  it('shows the generic error state as an alert', () => {
    chatState.status = 'error'
    chatState.error = new Error('fetch failed')
    render(<HermesChat />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      /something went wrong reaching hermes/i,
    )
  })

  it('shows the rate-limit copy for 429-flavored errors', () => {
    chatState.status = 'error'
    chatState.error = new Error('Request failed with status 429')
    render(<HermesChat />)

    expect(screen.getByRole('alert')).toHaveTextContent(/rate limit/i)
  })

  it('renders assistant messages with a working copy button', async () => {
    chatState.messages = [assistantMessage('m1', 'Hello from Hermes')]
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // Define AFTER setup(): userEvent installs its own clipboard stub, and
    // jsdom's navigator.clipboard is getter-only (define, don't assign).
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<HermesChat />)
    expect(screen.getByText('Hello from Hermes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('Hello from Hermes')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('focuses the composer when / is pressed outside a field', () => {
    render(<HermesChat />)

    fireEvent.keyDown(window, { key: '/' })

    expect(screen.getByLabelText('Message Hermes')).toHaveFocus()
  })
})

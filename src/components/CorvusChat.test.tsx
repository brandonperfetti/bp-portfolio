import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

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
// CorvusChat mounts a ClerkFirstNameProbe (calling useUser) whenever
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is set — which it is in local/CI envs but
// not the isolated build sandbox. Rendering the component bare (no
// <ClerkProvider>) then makes useUser throw, so mock it here; a null user
// exercises the anonymous, nameless greeting path.
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
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

describe('CorvusChat', () => {
  it('renders the idle intro (dynamic time-of-day greeting) and an enabled composer', () => {
    // Fixed clock so the greeting bucket is deterministic (#78): the
    // component computes it from `new Date().getHours()` at render time.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T09:00:00'))

    render(<CorvusChat />)

    expect(screen.getByText('Morning.')).toBeInTheDocument()
    expect(screen.getByText(/ask about brandon's work/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeEnabled()

    vi.useRealTimers()
  })

  it('sends trimmed input on Enter and clears the composer', async () => {
    const user = userEvent.setup()
    render(<CorvusChat />)
    const input = screen.getByLabelText('Message Corvus')

    await user.type(input, '  What does Brandon build?  ')
    await user.keyboard('{Enter}')

    expect(chatState.sendMessage).toHaveBeenCalledWith({
      text: 'What does Brandon build?',
    })
    expect(input).toHaveValue('')
  })

  it('does not submit on Shift+Enter (newline stays in the composer)', async () => {
    const user = userEvent.setup()
    render(<CorvusChat />)
    const input = screen.getByLabelText('Message Corvus')

    await user.type(input, 'line one')
    await user.keyboard('{Shift>}{Enter}{/Shift}')

    expect(chatState.sendMessage).not.toHaveBeenCalled()
  })

  it('refocuses the composer on empty submit instead of sending (v3 nicety)', async () => {
    const user = userEvent.setup()
    render(<CorvusChat />)

    await user.click(screen.getByRole('button', { name: /send/i }))

    expect(chatState.sendMessage).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message Corvus')).toHaveFocus()
  })

  it('disables Send and shows the thinking indicator while submitted', async () => {
    chatState.status = 'submitted'
    const user = userEvent.setup()
    render(<CorvusChat />)

    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
    expect(screen.getByText(/corvus is out looking/i)).toBeInTheDocument()

    // Enter must not fire while a response is in flight.
    const input = screen.getByLabelText('Message Corvus')
    await user.type(input, 'another question')
    await user.keyboard('{Enter}')
    expect(chatState.sendMessage).not.toHaveBeenCalled()
  })

  it('shows the generic error state as an alert', () => {
    chatState.status = 'error'
    chatState.error = new Error('fetch failed')
    render(<CorvusChat />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      /something went wrong reaching corvus/i,
    )
  })

  it('shows the rate-limit copy for 429-flavored errors', () => {
    chatState.status = 'error'
    chatState.error = new Error('Request failed with status 429')
    render(<CorvusChat />)

    expect(screen.getByRole('alert')).toHaveTextContent(/rate limit/i)
  })

  it('shows the sign-in prompt, not the red error alert, when the anon free-message gate rejects (#74)', () => {
    // useChat's fetch transport turns a non-ok response into
    // `new Error(await response.text())` — the route's JSON body text ends
    // up verbatim in `error.message`, exactly like the 429 case above.
    chatState.status = 'error'
    chatState.error = new Error(
      JSON.stringify({
        error:
          "You've used your free Corvus messages — sign in to keep chatting.",
        code: 'sign_in_required',
      }),
    )
    render(<CorvusChat />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByText(/used your free corvus messages/i),
    ).toBeInTheDocument()

    const signInLink = screen.getByRole('link', {
      name: /sign in to continue/i,
    })
    expect(signInLink).toHaveAttribute(
      'href',
      expect.stringContaining('/sign-in?redirect_url='),
    )
  })

  it('disables the composer while the sign-in prompt is showing, so a gated attempt cannot be typed', () => {
    chatState.status = 'error'
    chatState.error = new Error(JSON.stringify({ code: 'sign_in_required' }))
    render(<CorvusChat />)

    expect(screen.getByLabelText('Message Corvus')).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('renders assistant messages with a working copy button', async () => {
    chatState.messages = [assistantMessage('m1', 'Hello from Corvus')]
    const writeText = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    // Define AFTER setup(): userEvent installs its own clipboard stub, and
    // jsdom's navigator.clipboard is getter-only (define, don't assign).
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<CorvusChat />)
    expect(screen.getByText('Hello from Corvus')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /copy/i }))
    expect(writeText).toHaveBeenCalledWith('Hello from Corvus')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('focuses the composer when / is pressed outside a field', () => {
    render(<CorvusChat />)

    fireEvent.keyDown(window, { key: '/' })

    expect(screen.getByLabelText('Message Corvus')).toHaveFocus()
  })
})

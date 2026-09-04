import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CorvusChat from '@/components/CorvusChat'

/**
 * Regression guard for the mobile voice-to-text bug: a message composed by
 * dictation must clear the composer on send exactly like a typed one. The
 * failure was a trailing `onresult` (the recognizer's final transcript
 * arriving just after Send) repopulating the box after `setInput('')`. The
 * fix gates the transcript handler on an "actively dictating" ref that Send
 * clears, so any late transcript is ignored.
 *
 * `useSpeechInput` is mocked to expose the `onTranscript` callback so the test
 * can fire transcripts on demand and assert the composer's value, without a
 * real `SpeechRecognition` (jsdom has none).
 */
let transcriptCb: ((text: string) => void) | null = null
const speechState = {
  supported: true,
  listening: false,
  permissionDenied: false,
  unavailable: false,
  start: vi.fn(() => {
    speechState.listening = true
  }),
  stop: vi.fn(() => {
    speechState.listening = false
  }),
}
vi.mock('@/lib/corvus/useSpeechInput', () => ({
  useSpeechInput: ({
    onTranscript,
  }: {
    onTranscript: (text: string) => void
  }) => {
    transcriptCb = onTranscript
    return speechState
  },
}))
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: vi.fn(),
    status: 'ready',
    error: undefined,
  }),
}))
vi.mock('ai', () => ({ DefaultChatTransport: vi.fn() }))
vi.mock('streamdown', () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
}))
// #158: CorvusChat's reply-link component calls `useRouter` so an internal
// citation can navigate in-app. Mocked here for the same reason every other
// client-component suite in this repo mocks it — there is no app-router
// context in jsdom. Link BEHAVIOUR is asserted in
// `CorvusChat.linkSafety.test.tsx`, which drives the real streamdown.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/lib/motion/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}))

beforeEach(() => {
  transcriptCb = null
  speechState.listening = false
  speechState.start.mockClear()
  speechState.stop.mockClear()
  Element.prototype.scrollTo = vi.fn()
})

describe('CorvusChat voice dictation', () => {
  it('clears the composer on send and ignores a trailing transcript', async () => {
    const user = userEvent.setup()
    render(<CorvusChat />)
    const input = screen.getByLabelText('Message Corvus')

    // Start dictation, then a transcript fills the composer.
    await user.click(screen.getByRole('button', { name: /speak/i }))
    expect(speechState.start).toHaveBeenCalled()
    act(() => transcriptCb?.('what is the weather in orange county'))
    expect(input).toHaveValue('what is the weather in orange county')

    // Send: the composer clears AND recognition is stopped.
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(input).toHaveValue('')
    expect(speechState.stop).toHaveBeenCalled()

    // A late final transcript arriving after Send must NOT refill the box.
    act(() => transcriptCb?.('what is the weather in orange county today'))
    expect(input).toHaveValue('')
  })
})

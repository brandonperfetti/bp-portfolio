import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSpeechInput } from '@/lib/corvus/useSpeechInput'

/**
 * jsdom ships no `SpeechRecognition`/`webkitSpeechRecognition` — this suite
 * pins the unsupported (progressive-enhancement) path the real Firefox case
 * exercises: `supported` reports `false`, and `start()`/`stop()` are no-ops
 * rather than throwing, so a consumer that forgets to gate on `supported`
 * still can't crash. The listening/permission-denied paths need a real (or
 * hand-built) `SpeechRecognition`, which is Storybook/e2e territory — out of
 * scope for this unit suite.
 */
describe('useSpeechInput (unsupported browser)', () => {
  it('reports unsupported when the browser has no Web Speech API', () => {
    const { result } = renderHook(() =>
      useSpeechInput({ onTranscript: vi.fn() }),
    )

    expect(result.current.supported).toBe(false)
    expect(result.current.listening).toBe(false)
    expect(result.current.permissionDenied).toBe(false)
  })

  it('start() is a no-op — never throws, never starts listening', () => {
    const onTranscript = vi.fn()
    const { result } = renderHook(() => useSpeechInput({ onTranscript }))

    expect(() => result.current.start()).not.toThrow()
    expect(result.current.listening).toBe(false)
    expect(onTranscript).not.toHaveBeenCalled()
  })

  it('stop() is a no-op when nothing is listening', () => {
    const { result } = renderHook(() =>
      useSpeechInput({ onTranscript: vi.fn() }),
    )

    expect(() => result.current.stop()).not.toThrow()
  })
})

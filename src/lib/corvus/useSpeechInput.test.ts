import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
    expect(result.current.unavailable).toBe(false)
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

/**
 * Recognizer-present paths, driven through a hand-built `SpeechRecognition`
 * stub so jsdom can exercise them: that transcribed speech actually reaches
 * `onTranscript` (the "I speak but nothing enters the box" symptom would be a
 * regression here), and that the two failure modes set the right flag —
 * `not-allowed` → `permissionDenied` (fixable), `network` → `unavailable`
 * (this browser can't run recognition at all, e.g. Brave).
 */
describe('useSpeechInput (recognizer present)', () => {
  /** The most recent stub instance the hook constructed, for firing events. */
  let instance: {
    onresult: ((event: unknown) => void) | null
    onerror: ((event: { error: string }) => void) | null
    onend: (() => void) | null
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  } | null = null

  function installRecognizer() {
    // A factory (not a class) so there's no `this` to alias: a constructor
    // that returns an object hands that object back from `new`, which is what
    // the hook does — and we keep a reference to fire its handlers from tests.
    const construct = () => {
      const rec = {
        continuous: false,
        interimResults: false,
        lang: '',
        onresult: null as ((event: unknown) => void) | null,
        onerror: null as ((event: { error: string }) => void) | null,
        onend: null as (() => void) | null,
        start: vi.fn(),
        stop: vi.fn(),
      }
      instance = rec
      return rec
    }
    ;(window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      function SpeechRecognition() {
        return construct()
      }
  }

  afterEach(() => {
    instance = null
    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition
  })

  it('streams the recognized transcript into onTranscript', () => {
    installRecognizer()
    const onTranscript = vi.fn()
    const { result } = renderHook(() => useSpeechInput({ onTranscript }))

    expect(result.current.supported).toBe(true)
    act(() => result.current.start())
    expect(instance?.start).toHaveBeenCalled()

    // Shape mirrors a real SpeechRecognitionEvent: results[i][0].transcript.
    act(() => {
      instance?.onresult?.({
        resultIndex: 0,
        results: Object.assign([[{ transcript: 'hello corvus' }]], {
          length: 1,
        }),
      })
    })

    expect(onTranscript).toHaveBeenCalledWith('hello corvus')
  })

  it('flags permissionDenied (not unavailable) on a not-allowed error', () => {
    installRecognizer()
    const { result } = renderHook(() =>
      useSpeechInput({ onTranscript: vi.fn() }),
    )
    act(() => result.current.start())
    act(() => instance?.onerror?.({ error: 'not-allowed' }))

    expect(result.current.permissionDenied).toBe(true)
    expect(result.current.unavailable).toBe(false)
    expect(result.current.listening).toBe(false)
  })

  it('flags unavailable (not permissionDenied) on a network error with no transcript — the Brave case', () => {
    installRecognizer()
    const { result } = renderHook(() =>
      useSpeechInput({ onTranscript: vi.fn() }),
    )
    act(() => result.current.start())
    act(() => instance?.onerror?.({ error: 'network' }))

    expect(result.current.unavailable).toBe(true)
    expect(result.current.permissionDenied).toBe(false)
    expect(result.current.listening).toBe(false)
  })

  it('accumulates every segment from index 0 — a pause must not drop the start', () => {
    installRecognizer()
    const onTranscript = vi.fn()
    const { result } = renderHook(() => useSpeechInput({ onTranscript }))
    act(() => result.current.start())

    // First segment (interim).
    act(() =>
      instance?.onresult?.({
        resultIndex: 0,
        results: Object.assign([[{ transcript: 'hello ' }]], { length: 1 }),
      }),
    )
    // Segment 0 finalizes and segment 1 begins: the recognizer advances
    // resultIndex to 1, but `results` still holds BOTH. Reading only from
    // resultIndex would drop 'hello ' and surface just 'world'.
    act(() =>
      instance?.onresult?.({
        resultIndex: 1,
        results: Object.assign(
          [[{ transcript: 'hello ' }], [{ transcript: 'world' }]],
          { length: 2 },
        ),
      }),
    )

    expect(onTranscript).toHaveBeenLastCalledWith('hello world')
  })

  it('does NOT flag unavailable when a network error follows a successful transcript — the Safari hiccup', () => {
    installRecognizer()
    const { result } = renderHook(() =>
      useSpeechInput({ onTranscript: vi.fn() }),
    )
    act(() => result.current.start())
    act(() =>
      instance?.onresult?.({
        resultIndex: 0,
        results: Object.assign([[{ transcript: 'hi' }]], { length: 1 }),
      }),
    )
    act(() => instance?.onerror?.({ error: 'network' }))

    expect(result.current.unavailable).toBe(false)
  })
})

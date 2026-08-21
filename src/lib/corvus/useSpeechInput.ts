'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal surface of the Web Speech API this hook touches. Not part of
 * `lib.dom.d.ts` (support is inconsistent enough that TypeScript's DOM lib
 * doesn't ship it), so declared locally rather than pulling in a `@types`
 * package for a handful of members.
 */
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  readonly length: number
  readonly isFinal: boolean
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

/** Browser permission-denial error codes the Web Speech API reports. */
const PERMISSION_ERRORS = new Set(['not-allowed', 'service-not-allowed'])

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export interface UseSpeechInputOptions {
  /**
   * Called with the live transcript as recognition proceeds. Each call is a
   * full replacement of "what the composer should show right now" — interim
   * results supersede the previous interim text, and the final result
   * commits it. Callers should treat this exactly like typed input (it goes
   * through the same composer state, the same `/api/ai/chat` send path, and
   * the same guardrails — no separate backend is involved).
   */
  onTranscript: (text: string) => void
}

export interface UseSpeechInputResult {
  /**
   * Whether the browser exposes a Web Speech recognizer at all
   * (`SpeechRecognition` or `webkitSpeechRecognition`). `false` in Firefox
   * and any other browser without one — callers should hide the mic button
   * entirely in that case (progressive enhancement: typing always works).
   */
  supported: boolean
  /** Whether recognition is currently listening. */
  listening: boolean
  /**
   * Set after the browser denies microphone permission (`not-allowed` /
   * `service-not-allowed`). Cleared on the next `start()`. Callers show a
   * small inline note rather than crashing or silently doing nothing.
   */
  permissionDenied: boolean
  /**
   * Set when recognition can't run in this browser at all (a `network` error —
   * e.g. Brave with its speech backend disabled, or an offline browser — or
   * `audio-capture` with no usable mic), as opposed to a fixable permission
   * denial. Cleared on the next `start()`. Callers show an explanatory note.
   */
  unavailable: boolean
  /** Starts listening. No-op when unsupported or already listening. */
  start: () => void
  /** Stops listening. No-op when not currently listening. */
  stop: () => void
}

/**
 * Thin wrapper over the browser Web Speech API for the Corvus composer's mic
 * button (#80).
 *
 * @remarks Deliberately dumb: recognized text streams into the caller's
 * `onTranscript` exactly like typed input — no new backend, no ElevenLabs or
 * other STT service, no change to the guardrails in `/api/ai/chat` (#74).
 * `continuous` is `false` and `interimResults` is `true`, so a single
 * utterance streams interim transcripts as the visitor speaks; the
 * recognizer's own `onend` (utterance complete, or `stop()` called) is
 * treated as the end of the listening session. `lang` is read from
 * `navigator.language` at `start()` time. Unsupported browsers get
 * `supported: false` — `start`/`stop` are no-ops so a consumer that forgets
 * to gate on `supported` still can't crash.
 */
export function useSpeechInput({
  onTranscript,
}: UseSpeechInputOptions): UseSpeechInputResult {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  // Whether this recognizer has ever produced a transcript. Used to tell a
  // browser that genuinely can't run recognition (Brave: `network` error with
  // no transcript, ever) apart from one that works but emits a spurious
  // `network` error mid-session (iOS Safari does this even while transcribing
  // fine) — only the former should surface the "unavailable" note.
  const hasTranscribedRef = useRef(false)

  useEffect(() => {
    setSupported(Boolean(getRecognitionConstructor()))
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (recognitionRef.current) return // already listening

    const Recognition = getRecognitionConstructor()
    if (!Recognition) return // unsupported — no-op, never throws

    const recognition = new Recognition()
    // `continuous = true` so a brief pause mid-sentence doesn't end the
    // session and truncate the utterance (notably with Bluetooth mics like
    // AirPods, which also clip the very start while the mic spins up — a
    // hardware latency we can't fully recover in JS). The consumer stops
    // recognition explicitly (tapping the mic, or sending).
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang =
      typeof navigator !== 'undefined' ? navigator.language : 'en-US'

    recognition.onresult = (event) => {
      // Accumulate EVERY result from index 0, not from `event.resultIndex`:
      // once a segment finalizes, the recognizer advances `resultIndex` past
      // it, so reading from there drops the already-finalized start and the
      // composer would show only the latest segment (the "it replaced my text
      // with the end after I paused" bug). Concatenating all results — final
      // and interim, in order — rebuilds the full transcript each time.
      let text = ''
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0]?.transcript ?? ''
      }
      if (text) hasTranscribedRef.current = true
      onTranscriptRef.current(text)
    }
    recognition.onerror = (event) => {
      if (PERMISSION_ERRORS.has(event.error)) {
        setPermissionDenied(true)
      } else if (event.error === 'audio-capture') {
        // No usable microphone — genuinely unavailable regardless of browser.
        setUnavailable(true)
      } else if (event.error === 'network' && !hasTranscribedRef.current) {
        // `network` only means "this browser can't run recognition" when it
        // has NEVER transcribed (Brave, whose backend is disabled). A network
        // error after a successful transcript is a transient Safari hiccup —
        // don't mislabel a working browser as unsupported.
        setUnavailable(true)
      }
      recognitionRef.current = null
      setListening(false)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }

    recognitionRef.current = recognition
    setPermissionDenied(false)
    setUnavailable(false)
    setListening(true)
    recognition.start()
  }, [])

  // Stop any in-flight recognition on unmount (route change, etc.) rather
  // than leaving the mic hot after the composer is gone.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return { supported, listening, permissionDenied, unavailable, start, stop }
}

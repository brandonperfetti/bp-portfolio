'use client'

import { useChat } from '@ai-sdk/react'
import { useUser } from '@clerk/nextjs'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'

import { Copy as CopyIcon } from 'lucide-react'

import { MicIcon, SendIcon } from '@/icons'
import {
  createCorvusChatFetch,
  SIGN_IN_REQUIRED_CODE,
} from '@/lib/ai/corvusChatFetch'
import { getCorvusGreeting } from '@/lib/corvus/greeting'
import { useSpeechInput } from '@/lib/corvus/useSpeechInput'
import { reportSpeechRecognitionError } from '@/lib/observability/clientTelemetry'
import { useTurnstileToken } from '@/lib/security/useTurnstileToken'
import { RavenMark } from '@/components/corvus/RavenMark'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ui/conversation'
import { Message, MessageContent } from '@/components/ui/message'
import { ShimmeringText } from '@/components/ui/shimmering-text'

/**
 * Custom `fetch` for `DefaultChatTransport` — normalizes the sign-in-gate
 * 401 to a message `isSignInRequiredError` can trust (#74 addendum 2, see
 * `@/lib/ai/corvusChatFetch` for the full mobile-staging story: matching
 * against the SDK's own `error.message` surfacing proved unreliable on real
 * mobile Safari). Module-scope singleton — stateless, no per-render
 * dependencies, and its default `baseFetch` resolves the global `fetch` at
 * CALL time, so it still picks up whatever `fetch` is current when a
 * request actually fires.
 */
const corvusChatFetch = createCorvusChatFetch()

function isSignInRequiredError(error: Error | undefined): boolean {
  return Boolean(error?.message?.includes(SIGN_IN_REQUIRED_CODE))
}

/**
 * Whether Clerk is configured for this deployment, read the client-safe way.
 *
 * @remarks `isClerkEnabled` (`@/lib/auth/clerkEnabled`) also checks
 * `CLERK_SECRET_KEY`, which is never inlined into client bundles — calling
 * it here would always read `false`. This mirrors the half of that check
 * `AuthProvider` can see server-side to decide whether to mount
 * `<ClerkProvider>`, so whenever this is `true` a provider is guaranteed to
 * be present in the tree.
 */
const CLERK_ENABLED_CLIENT = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
)

/**
 * Resolves the signed-in visitor's Clerk first name for the empty-state
 * greeting.
 *
 * @remarks Isolated into its own component — rendered only when
 * {@link CLERK_ENABLED_CLIENT} is true — because `useUser` throws when
 * called outside a `<ClerkProvider>`, which `AuthProvider` never mounts in
 * keys-off environments. `CorvusChat` must never call `useUser` directly.
 */
function ClerkFirstNameProbe({
  onChange,
}: {
  onChange: (firstName: string | null) => void
}) {
  const { user } = useUser()

  useEffect(() => {
    onChange(user?.firstName ?? null)
  }, [user, onChange])

  return null
}

export interface CorvusChatProps {
  /**
   * The compact in-card agent header's name — CMS-driven (`page?.title`)
   * from the caller. Also rendered as the page's single `<h1>` for SEO.
   * Defaults to `'Corvus'` for callers (Storybook, tests) that render this
   * component with no CMS page behind it.
   */
  title?: string
  /** The agent header's subtitle line, one row below `title`. */
  subtitle?: string
}

/**
 * Corvus chat client on `useChat` + streamdown (replaces the v3 manual
 * `ReadableStream` reader over a hand-rolled NDJSON protocol).
 *
 * @remarks Retained v3 niceties: `/` focuses the input, Enter submits
 * (Shift+Enter for newline), textarea autosize, assistant copy buttons, and a
 * reduced-motion-aware intro (no entrance animation when reduced motion is
 * set). Presentation is built on our own reconstructed
 * `Conversation`/`Message`/`ShimmeringText` components
 * (`src/components/ui/{conversation,message,shimmering-text}.tsx`) rather
 * than ElevenLabs UI's registry — ui.elevenlabs.io rate-limits/blocks
 * automated pulls (403/429) from this build sandbox, so #79 reconstructed
 * equivalent presentational components against our own design tokens
 * instead of vendoring theirs ("Path B"). The Corvus visual identity theme
 * (the atlas palette, dynamic greeting) is layered on separately via
 * `data-slot`-scoped CSS under `.corvus-surface` in `src/styles/tailwind.css`
 * (#78, re-skinned to the approved mock in the composer/bubble/header pass
 * below) — this component's own utility classes are the zinc/teal default
 * and stay that way outside `.corvus-surface` (e.g. in Storybook).
 *
 * Owns the page's compact in-card agent header (raven avatar, `title` as an
 * `<h1>`, `subtitle`, a green "online" dot) — `CorvusPage` no longer renders
 * a separate hero-style header, so this component is the single source of
 * that identity band. Also owns the Web Speech voice-input mic button (#80)
 * via {@link useSpeechInput}: transcribed speech lands in the same composer
 * state as typed text and sends through the same `/api/ai/chat` path, so the
 * #74 guardrails apply identically regardless of input method.
 */
export default function CorvusChat({
  title = 'Corvus',
  subtitle = 'Prefix your prompt with image: or Dali: to generate an image.',
}: CorvusChatProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  // True only while a dictation session is actively feeding the composer.
  // Cleared on send so a late final transcript can't repopulate the box after
  // it's been cleared (the "voice message doesn't clear on send" bug).
  const dictatingRef = useRef(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [firstName, setFirstName] = useState<string | null>(null)

  // The empty-state greeting is time-of-day (and optionally name) flavored —
  // both are only knowable client-side, so the first paint renders a
  // neutral greeting and the real one fills in after mount. This must never
  // run during SSR: the server has no visitor-local clock, so rendering a
  // guess there would either flash the wrong greeting or mismatch hydration.
  useEffect(() => {
    setMounted(true)
  }, [])
  const greeting = mounted
    ? getCorvusGreeting(new Date().getHours(), firstName)
    : 'Welcome.'

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        fetch: corvusChatFetch,
      }),
    [],
  )
  const { messages, sendMessage, status, error } = useChat({ transport })

  // Chat's Turnstile flow is wired but armed separately from the contact
  // form (rollout decision 2026-08-10): tokens are only acquired when
  // NEXT_PUBLIC_TURNSTILE_PROTECT_CHAT is 'true', matching the server's
  // TURNSTILE_PROTECT_CHAT enforcement flag — flip both to arm.
  const { containerRef: turnstileRef, getToken } = useTurnstileToken({
    enabled: process.env.NEXT_PUBLIC_TURNSTILE_PROTECT_CHAT === 'true',
  })

  const isBusy = status === 'submitted' || status === 'streaming'
  // Friendly sign-in prompt, not an error: the server rejected this message
  // because the anonymous free-message budget is spent (#74). Composer stays
  // disabled while this is showing — resubmitting would just hit the same
  // gate again.
  const signInRequired = isSignInRequiredError(error)

  // `/` focuses the chat input from anywhere on the page (v3 behavior).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      if (event.key === '/' && !inField) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const autosize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  // Web Speech voice input (#80). Transcribed text — interim and final — is
  // set directly as the composer value, exactly like typed input: it flows
  // through the same `submit()` below, so #74's guardrails and the
  // sign-in-required disable apply identically. No new backend involved.
  const handleTranscript = useCallback(
    (text: string) => {
      // Ignore transcripts that arrive once dictation is over (e.g. a trailing
      // final result after the message was already sent) — otherwise they'd
      // refill the just-cleared composer.
      if (!dictatingRef.current) return
      setInput(text)
      requestAnimationFrame(autosize)
    },
    [autosize],
  )
  const speech = useSpeechInput({
    onTranscript: handleTranscript,
    // Record the real recognizer error codes to Sentry Logs (diagnostics
    // only — no Sentry Issue), so the iOS-Safari `network`-error behavior is
    // measurable in the field rather than inferred.
    onError: reportSpeechRecognitionError,
  })
  const toggleListening = useCallback(() => {
    if (speech.listening) {
      speech.stop()
    } else {
      dictatingRef.current = true
      inputRef.current?.focus()
      speech.start()
    }
  }, [speech])

  const submit = useCallback(() => {
    const text = input.trim()
    if (!text) {
      // Retained v3 nicety: an empty submit refocuses the input instead of
      // silently doing nothing.
      inputRef.current?.focus()
      return
    }
    if (isBusy || signInRequired) return
    // End any in-flight dictation and drop its trailing transcript so a
    // voice-composed message clears the composer on send exactly like a typed
    // one (handleTranscript no-ops once dictatingRef is false).
    dictatingRef.current = false
    speech.stop()
    // Tokens are single-use, so each send fetches its own; getToken()
    // resolves null instantly when chat protection is disarmed, keeping
    // the default path free of any Turnstile latency.
    void (async () => {
      const turnstileToken = await getToken()
      if (turnstileToken) {
        void sendMessage({ text }, { body: { turnstileToken } })
      } else {
        void sendMessage({ text })
      }
    })()
    setInput('')
    requestAnimationFrame(autosize)
  }, [autosize, getToken, input, isBusy, sendMessage, signInRequired, speech])

  const copyMessage = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1600)
    } catch {
      // Clipboard unavailable (permissions/insecure context) — ignore.
    }
  }, [])

  const messageText = (message: (typeof messages)[number]) =>
    message.parts
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('')

  // Bring the visitor back to wherever they were chatting from. Read at
  // render time (this block only ever shows after a client-side error, well
  // past hydration) rather than hardcoding /corvus, since CorvusChat could
  // be mounted elsewhere.
  const signInRedirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/corvus'

  return (
    <div
      data-slot="chat-card"
      className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-100 p-3 sm:p-4 dark:border-zinc-700/40"
    >
      {CLERK_ENABLED_CLIENT && <ClerkFirstNameProbe onChange={setFirstName} />}

      {/* Compact in-card agent header (replaces the separate hero-style
          header/constellation backdrop the page used to render — that
          "went overboard"; this is the whole identity band now). `title`
          is the page's one accessible `<h1>`. */}
      <div
        data-slot="agent-header"
        className="mb-3 flex shrink-0 items-center gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-700/40"
      >
        <div
          data-slot="agent-avatar"
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
        >
          <RavenMark aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1
            data-slot="agent-name"
            className="truncate text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            {title}
          </h1>
          <p
            data-slot="agent-subtitle"
            className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400"
          >
            {subtitle}
          </p>
        </div>
        <span
          data-slot="agent-status"
          aria-hidden="true"
          className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500"
        />
      </div>

      <Conversation aria-busy={isBusy || undefined}>
        <ConversationContent>
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={<RavenMark className="h-7 w-7" />}
              title={greeting}
              description={
                <>
                  Ask about Brandon&apos;s work — or whatever else is on your
                  mind. Press{' '}
                  <kbd className="rounded border border-zinc-300 px-1 dark:border-zinc-600">
                    /
                  </kbd>{' '}
                  to focus this chat anytime.
                </>
              }
            />
          )}
          {messages.map((message) => {
            const text = messageText(message)
            const isAssistant = message.role === 'assistant'
            const from = isAssistant ? 'assistant' : 'user'
            return (
              <Message key={message.id} from={from}>
                {isAssistant && (
                  <div
                    data-slot="message-avatar"
                    aria-hidden="true"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center self-end rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    <RavenMark
                      aria-hidden="true"
                      className="h-[15px] w-[15px]"
                    />
                  </div>
                )}
                <div className="mx-1 flex max-w-[92%] flex-col items-start gap-1.5 lg:max-w-[80%]">
                  <MessageContent from={from}>
                    {isAssistant ? (
                      <div className="corvus-markdown max-w-none">
                        <Streamdown>{text}</Streamdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{text}</span>
                    )}
                  </MessageContent>
                  {isAssistant && text && (
                    <button
                      type="button"
                      data-slot="message-copy-button"
                      onClick={() => void copyMessage(message.id, text)}
                      className="inline-flex items-center gap-1 rounded px-1 text-xs text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copiedId === message.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </Message>
            )
          })}
          {status === 'submitted' && (
            <ShimmeringText text="Corvus is out looking…" className="text-sm" />
          )}
          {error &&
            (signInRequired ? (
              // Friendly, on-brand prompt — not framed as an error. Mirrors
              // the gated-article sign-in CTA (articles/[slug]/page.tsx) so
              // the "sign in, it's free" pattern reads the same everywhere on
              // the site. No entrance animation to gate behind reduced
              // motion: this block is static from the moment it mounts.
              <div
                data-slot="sign-in-gate"
                className="rounded-2xl border border-zinc-200 p-4 text-center dark:border-zinc-700/60"
              >
                <p
                  data-slot="sign-in-gate-title"
                  className="text-sm font-medium text-zinc-800 dark:text-zinc-100"
                >
                  You&apos;ve used your free Corvus messages.
                </p>
                <p
                  data-slot="sign-in-gate-body"
                  className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
                >
                  Sign in (it&apos;s free) to keep chatting.
                </p>
                <a
                  data-slot="sign-in-gate-cta"
                  href={`/sign-in?redirect_url=${encodeURIComponent(signInRedirectUrl)}`}
                  className="mt-3 inline-flex items-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
                >
                  Sign in to continue
                </a>
              </div>
            ) : (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {error.message.includes('429') ||
                error.message.toLowerCase().includes('rate')
                  ? 'Corvus needs a breather — you have hit the rate limit. Try again in a minute.'
                  : 'Something went wrong reaching Corvus. Please try again.'}
              </p>
            ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form
        className="mt-3 shrink-0"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {/* The ElevenLabs-style composer pill: one rounded field holding the
            text input, then two ghost icon buttons — mic, then send. No big
            colored Send button, no teal. */}
        <div
          data-slot="composer-field"
          className="flex items-end gap-1 rounded-2xl border border-zinc-200 bg-white py-1.5 pr-1.5 pl-4 transition-shadow focus-within:ring-2 focus-within:ring-teal-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <textarea
            ref={inputRef}
            data-slot="composer-input"
            value={input}
            rows={1}
            disabled={signInRequired}
            onChange={(event) => {
              setInput(event.target.value)
              autosize()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            placeholder={
              signInRequired ? 'Sign in to keep chatting…' : 'Ask Corvus...'
            }
            aria-label="Message Corvus"
            className="min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-base text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {speech.supported && (
            <button
              type="button"
              data-slot="composer-mic"
              data-listening={speech.listening ? 'true' : undefined}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Stop' : 'Speak'}
              aria-describedby={
                speech.permissionDenied || speech.unavailable
                  ? 'corvus-mic-note'
                  : undefined
              }
              disabled={signInRequired}
              onClick={toggleListening}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <MicIcon className="h-[19px] w-[19px]" />
            </button>
          )}
          <button
            type="submit"
            data-slot="composer-send"
            aria-label="Send"
            disabled={isBusy || signInRequired}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-teal-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-teal-400"
          >
            <SendIcon className="h-[19px] w-[19px] rotate-90" />
          </button>
        </div>
        {(speech.permissionDenied || speech.unavailable) && (
          <p
            id="corvus-mic-note"
            data-slot="composer-mic-note"
            className="mt-1.5 px-1 text-xs text-zinc-500 dark:text-zinc-400"
          >
            {speech.permissionDenied
              ? 'Enable microphone access to speak.'
              : "Voice input isn't available in this browser — try Chrome, Edge, or Safari."}
          </p>
        )}
      </form>
      {/* Turnstile mount point — empty unless chat protection is armed AND
          Cloudflare escalates to an interactive challenge. */}
      <div ref={turnstileRef} className="empty:hidden [&:not(:empty)]:pt-2" />
    </div>
  )
}

'use client'

import { useChat } from '@ai-sdk/react'
import { useUser } from '@clerk/nextjs'
import { DefaultChatTransport } from 'ai'
import { useRouter } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
} from 'react'
import { Streamdown } from 'streamdown'

import { Copy as CopyIcon } from 'lucide-react'

import { MicIcon, SendIcon } from '@/icons'
import {
  createCorvusChatFetch,
  SIGN_IN_REQUIRED_CODE,
} from '@/lib/ai/corvusChatFetch'
import { classifyCorvusLink, type CorvusLinkKind } from '@/lib/ai/linkSafety'
import { getCorvusGreeting } from '@/lib/corvus/greeting'
import { useSpeechInput } from '@/lib/corvus/useSpeechInput'
import { reportSpeechRecognitionError } from '@/lib/observability/clientTelemetry'
import { useTurnstileToken } from '@/lib/security/useTurnstileToken'
import { useMounted } from '@/lib/useMounted'
import { RavenMark } from '@/components/corvus/RavenMark'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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

/**
 * Confirmation copy per link kind (#158).
 *
 * @remarks The `external` strings are streamdown's own, kept verbatim. They
 * were already accurate for an off-site page and reusing them keeps the
 * visitor-facing wording unchanged for the case that has not changed — the
 * modal here is a replacement for streamdown's, not a redesign of it.
 *
 * `mailto` and `tel` are the honest-copy half of #158. #144 sent both through
 * the "external website" modal and `linkSafety.ts` documented that as the
 * conservative error; with our own modal there is no reason to keep lying
 * about what the button does.
 */
const LINK_CONFIRMATION_COPY: Record<
  Exclude<CorvusLinkKind, 'internal' | 'incomplete'>,
  { title: string; body: string; confirm: string }
> = {
  external: {
    title: 'Open external link?',
    body: "You're about to visit an external website.",
    confirm: 'Open link',
  },
  mailto: {
    title: 'Open your email app?',
    body: 'This link hands off to whatever app composes your email.',
    confirm: 'Open email app',
  },
  tel: {
    title: 'Start a phone call?',
    body: 'This link hands off to whatever app places your calls.',
    confirm: 'Open dialler',
  },
}

/**
 * The link component streamdown renders for every anchor in a reply (#158).
 *
 * @remarks Replaces streamdown's `MarkdownA` wholesale via `components.a`,
 * which is the ONLY seam that can produce a real `<a href>`: streamdown 2.5.0's
 * `linkSafety` branch renders a `<button>` unconditionally and `renderModal`
 * replaces only the dialog, never the trigger
 * (`node_modules/streamdown/dist/chunk-BO2N2NFS.js`, verified 2026-09-04).
 * Since a user `components` entry wins outright (`{...defaults, ...user}` in
 * that same file), `linkSafety` is no longer passed at all — it would be dead
 * configuration describing a component that never mounts.
 *
 * Brandon's rule for #158, and the whole shape of this component: **internal
 * links navigate in the same tab; only external links open a new tab and keep
 * the confirmation.**
 *
 * So an internal citation is a real anchor with a real `href` — inspectable,
 * hoverable, middle-clickable, copyable — and its plain-click handler is a
 * `router.push`, i.e. an in-app navigation rather than a document load.
 * Modified clicks (⌘/Ctrl/Shift/Alt, or any non-primary button) are left
 * alone so "open in a new tab" still means what the visitor expects; that is
 * the browser's job and the reason the `href` is real rather than decorative.
 *
 * Everything else keeps a confirmation, because Corvus is a broad assistant
 * that legitimately names off-site URLs. That branch is a `<button>` on
 * purpose: it does not navigate on click, so rendering it as an anchor would
 * promise something it does not do.
 */
function CorvusReplyLink({
  children,
  href,
  className,
  node: _node,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // `window.location.host` is read here rather than inside `linkSafety.ts` so
  // that module stays pure. Assistant messages only ever exist after a client
  // round trip, so there is no server render of this component to mismatch.
  const kind = classifyCorvusLink(href, {
    currentHost:
      typeof window === 'undefined' ? undefined : window.location.host,
  })

  // Closing is state only. Cancel and Confirm route through here; Radix's
  // Escape and outside-click arrive as `onOpenChange(false)` and set the same
  // state directly.
  //
  // Nothing else happens here, and nothing else happens anywhere in this
  // component (#169). The hand-rolled `inert` effect and the manual focus
  // restore that used to sit at this spot are gone: they were not
  // belt-and-braces but a coupled pair — the card-scoped `inert` is what
  // DISABLED the primitive's own restore (focusing into an inert subtree is
  // silently a no-op), and the manual `trigger.focus()` in the cleanup is what
  // then repaired it. `hideOthers` takes the rest of the page out of the
  // accessibility tree while the dialog is open, and `DialogTrigger` (below)
  // is what gives Radix the node to restore focus to. See
  // `docs/ACCESSIBILITY.md` §Focus.
  const close = useCallback(() => {
    setConfirming(false)
  }, [])

  // teal-700 / teal-400 rather than `text-primary` (#190). `--primary` is a
  // FILL token — one colour in both themes (teal-700), paired with white — so
  // reading it as TEXT is a role confusion that only went unnoticed while the
  // scaffold happened to make it near-black in light and near-white in dark.
  // Themed to the site palette it measures 3.69:1 on the dark page and 2.61:1
  // on the dark assistant bubble, both under WCAG 1.4.3. This is the site's
  // actual link accent instead — the nav's active-link pair, identical to
  // `--corvus-accent` in each theme: 5.16:1 / 4.90:1 in light (page / bubble),
  // 10.66:1 / 7.98:1 in dark.
  const linkClassName = [
    'wrap-anywhere font-medium text-teal-700 underline dark:text-teal-400',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (kind === 'incomplete' || !href) {
    // Mid-stream markdown: streamdown emits a sentinel href for a link whose
    // closing paren has not arrived. Render the text, not a target.
    return (
      <span className={linkClassName} data-incomplete data-streamdown="link">
        {children}
      </span>
    )
  }

  if (kind === 'internal') {
    return (
      <a
        {...rest}
        className={linkClassName}
        data-corvus-link="internal"
        data-streamdown="link"
        href={href}
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return
          }
          event.preventDefault()
          router.push(href)
        }}
      >
        {children}
      </a>
    )
  }

  const copy = LINK_CONFIRMATION_COPY[kind]

  return (
    // `DialogTrigger asChild` rather than a bare button beside the dialog, and
    // that is what makes the focus RESTORE Radix's (#169). `DialogContentModal`
    // handles `onCloseAutoFocus` by calling `event.preventDefault()` — which
    // cancels `FocusScope`'s own restore — and then focusing
    // `context.triggerRef.current` instead
    // (`@radix-ui/react-dialog/dist/index.mjs`). That ref is populated ONLY by
    // `DialogTrigger`. Opening a controlled dialog from a plain sibling button
    // therefore leaves the ref null, so the primitive cancels its restore and
    // then focuses nothing, and focus falls to `<body>` — measured here in
    // jsdom and true of any browser, since it is one code path with no
    // environment-dependent step. Registering the trigger is the whole fix:
    // Radix then restores focus to it on close, in the right order, with
    // nothing hand-rolled left in this component.
    <Dialog open={confirming} onOpenChange={setConfirming}>
      <DialogTrigger asChild>
        <button
          className={`${linkClassName} appearance-none text-left`}
          data-corvus-link={kind}
          data-streamdown="link"
          type="button"
        >
          {children}
        </button>
      </DialogTrigger>
      <DialogContent
        // Radix 1.1.20 deliberately does NOT emit `aria-modal` — it hides the
        // rest of the page with `aria-hidden` on the portal's siblings
        // instead, because `aria-modal` is inconsistently honoured across
        // screen readers (verified in
        // `@radix-ui/react-dialog/dist/index.mjs`, `DialogContentImpl`, which
        // sets `role`, `aria-labelledby` and `aria-describedby` and nothing
        // else). The attribute is set here because it IS true of this dialog
        // and because `CorvusChat.linkSafety.test.tsx` and the
        // `ExternalLinkConfirmation` story both pin it as part of #158's a11y
        // floor. `contentProps` spread after Radix's own attributes, so this
        // wins. Set at the call site, not in the primitive: overriding
        // upstream's semantics for every future dialog is a larger decision
        // than honouring one existing contract.
        aria-modal="true"
        className="max-w-md gap-3 sm:max-w-md"
        data-streamdown="link-safety-modal"
        // No ✕: Cancel is already the dismissal, and #158's rule for this
        // modal is that it replaces streamdown's rather than redesigning it.
        showCloseButton={false}
        // Focus lands on the CONFIRMING action, not on Radix's default (the
        // first focusable, i.e. Cancel). streamdown's own modal left focus on
        // the now-hidden trigger and a keyboard visitor had to tab blind;
        // landing on the affirmative action is what replaced that.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          confirmRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <p className="rounded-md bg-muted p-3 font-mono text-sm break-all">
          {href}
        </p>
        <DialogFooter className="sm:justify-stretch">
          <Button
            className="flex-1"
            onClick={close}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            className="flex-1"
            // `teal`, not `default`. Since #190 the two are equivalent —
            // same teal-700 fill, same white label, and the same teal-800
            // hover, now that `default` consumes `--primary-hover` instead of
            // `bg-primary/90`. So this is no longer a choice between two
            // appearances: `teal` is simply what this button has rendered
            // since #113 and it is kept until the variants are collapsed.
            // Retiring `teal` is a change to `ui/button.tsx` and every one of
            // its call sites, and is recorded as a follow-up ticket; when that
            // lands, this becomes `default` with no visual change.
            variant="teal"
            onClick={() => {
              // `mailto:`/`tel:` hand off to another application; opening
              // them in a new tab leaves an empty one behind on the
              // browsers that do not close it themselves. Only a real
              // off-site PAGE gets `_blank`.
              if (kind === 'external') {
                window.open(href, '_blank', 'noreferrer')
              } else {
                window.open(href, '_self')
              }
              close()
            }}
            type="button"
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * streamdown's component overrides for a Corvus reply.
 *
 * @remarks Module scope, so its identity is stable across renders —
 * `Streamdown` memoises its merged component map on the `components` prop's
 * identity, and a fresh object per render would rebuild it every token.
 */
const CORVUS_MARKDOWN_COMPONENTS = { a: CorvusReplyLink }

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
  const mounted = useMounted()
  const [firstName, setFirstName] = useState<string | null>(null)

  // The empty-state greeting is time-of-day (and optionally name) flavored —
  // both are only knowable client-side, so the first paint renders a
  // neutral greeting and the real one fills in after mount. This must never
  // run during SSR: the server has no visitor-local clock, so rendering a
  // guess there would either flash the wrong greeting or mismatch hydration
  // (`useMounted` carries that contract).
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
                        {/* #158: `components.a` — NOT `linkSafety`. See
                            {@link CorvusReplyLink}: streamdown's guarded link
                            is a `<button>` in every branch, so an internal
                            citation could not be a real anchor until its link
                            component was replaced outright. */}
                        <Streamdown components={CORVUS_MARKDOWN_COMPONENTS}>
                          {text}
                        </Streamdown>
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
                      // Same AA call as the CTA below, one step over: this is
                      // 12px TEXT ("Copy"), so the 4.5:1 floor applies, and
                      // teal-600 on the light page is 3.67:1 — a fail. teal-700
                      // is 5.36:1. Dark is already fine (teal-400 on zinc-900
                      // is 9.50:1) and is left alone. Overridden on /corvus by
                      // `.corvus-surface [data-slot='message-copy-button']
                      // :hover` (--corvus-accent, already teal-700 in light),
                      // so this fixes the component outside that surface.
                      className="inline-flex items-center gap-1 rounded px-1 text-xs text-zinc-500 hover:text-teal-700 dark:text-zinc-400 dark:hover:text-teal-400"
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
                  // Hover darkens, for the reason spelled out on the primary
                  // Button and on ui/button.tsx's `teal` variant: white on
                  // teal-600 is 3.67:1, under the 4.5:1 AA floor for this text
                  // size, while teal-800 is 7.54:1 (Tailwind 4.3.3 OKLCH
                  // tokens). On /corvus this class is overridden by
                  // `.corvus-surface [data-slot='sign-in-gate-cta']:hover`,
                  // which reads --corvus-accent-solid-hover in
                  // src/styles/tailwind.css — raised to teal-800 there too, so
                  // the two agree. Both are pinned:
                  // `CorvusChat.signInGate.test.tsx` for this class,
                  // `src/styles/corvus-accent-contrast.test.ts` for the token.
                  className="mt-3 inline-flex items-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
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

'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Streamdown } from 'streamdown'

import { Copy as CopyIcon } from 'lucide-react'

import { SendIcon } from '@/icons'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'

/**
 * Hermes chat client on `useChat` + streamdown (replaces the v3 manual
 * `ReadableStream` reader over a hand-rolled NDJSON protocol).
 *
 * @remarks Retained v3 niceties: `/` focuses the input, Enter submits
 * (Shift+Enter for newline), textarea autosize, assistant copy buttons, and a
 * reduced-motion-aware intro (no entrance animation when reduced motion is
 * set). TODO(brandon): swap the bubble shell for ElevenLabs UI
 * Conversation/Message components via `@elevenlabs/cli` (registry is
 * unreachable from the build sandbox; props here mirror them so the swap is
 * mechanical).
 */
export default function HermesChat() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/ai/chat' }),
    [],
  )
  const { messages, sendMessage, status, error } = useChat({ transport })

  const isBusy = status === 'submitted' || status === 'streaming'

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

  // Keep the newest message in view; jump instantly under reduced motion.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }, [messages, prefersReducedMotion])

  const autosize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  const submit = useCallback(() => {
    const text = input.trim()
    if (!text) {
      // Retained v3 nicety: an empty submit refocuses the input instead of
      // silently doing nothing.
      inputRef.current?.focus()
      return
    }
    if (isBusy) return
    void sendMessage({ text })
    setInput('')
    requestAnimationFrame(autosize)
  }, [autosize, input, isBusy, sendMessage])

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

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-100 p-4 dark:border-zinc-700/40">
      <div
        ref={scrollRef}
        aria-live="polite"
        className="min-h-0 flex-1 space-y-4 overflow-auto p-2"
      >
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Hermes here — ask about Brandon&apos;s work, articles, projects, or
            tech stack. Press{' '}
            <kbd className="rounded border border-zinc-300 px-1 dark:border-zinc-600">
              /
            </kbd>{' '}
            to focus this chat anytime.
          </p>
        )}
        {messages.map((message) => {
          const text = messageText(message)
          const isAssistant = message.role === 'assistant'
          return (
            <div key={message.id} className="chat-message">
              <div
                className={`flex items-end ${isAssistant ? '' : 'justify-end'}`}
              >
                <div
                  className={`mx-1 max-w-[92%] space-y-2 text-sm lg:max-w-[80%] ${
                    isAssistant ? 'items-start' : 'items-end'
                  }`}
                >
                  <span
                    className={`inline-block rounded-xl px-4 py-2.5 ${
                      isAssistant
                        ? 'rounded-bl-none bg-teal-700 text-white'
                        : 'rounded-br-none bg-zinc-500 text-white dark:bg-zinc-600'
                    }`}
                  >
                    {isAssistant ? (
                      <div className="hermes-markdown max-w-none text-white">
                        <Streamdown>{text}</Streamdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{text}</span>
                    )}
                  </span>
                  {isAssistant && text && (
                    <button
                      type="button"
                      onClick={() => void copyMessage(message.id, text)}
                      className="inline-flex items-center gap-1 rounded px-1 text-xs text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      {copiedId === message.id ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {status === 'submitted' && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Hermes is thinking…
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error.message.includes('429') ||
            error.message.toLowerCase().includes('rate')
              ? 'Hermes needs a breather — you have hit the rate limit. Try again in a minute.'
              : 'Something went wrong reaching Hermes. Please try again.'}
          </p>
        )}
      </div>

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
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
          placeholder="Ask Hermes..."
          aria-label="Message Hermes"
          className="min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-teal-500 focus:outline-none sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span>Send</span>
          <SendIcon className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

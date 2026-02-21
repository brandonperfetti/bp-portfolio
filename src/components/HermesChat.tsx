'use client'

import Image from 'next/image'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useRef, useState } from 'react'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  image?: string
}

const STARTER_MESSAGE =
  "Hey there 👋, I'm Hermes ⚡, your virtual assistant! What can I help with?"

const EXAMPLES = [
  `Explain "The Observer Effect".`,
  `Dali: A digital illustration of a man meditating while sitting on a donut, 4k, detailed, pixar animation.`,
]

function createMessageId() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }
  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="my-1 leading-7">{children}</p>,
  h1: ({ children }) => (
    <h1 className="my-2 text-base leading-7 font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="my-2 text-base leading-7 font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="my-2 text-base leading-7 font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="my-2 text-base leading-7 font-semibold">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="my-0 leading-7">{children}</li>,
  hr: () => <hr className="my-3 border-white/20" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-zinc-900/35 p-3 text-sm leading-6">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-zinc-900/25 px-1.5 py-0.5 text-[0.92em]">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="underline decoration-white/50 underline-offset-2 hover:decoration-white"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
}

function CopyIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" />
      <rect x="2" y="2" width="9" height="9" rx="2" stroke="currentColor" />
    </svg>
  )
}

function SendIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2 8h9m0 0L7.5 4.5M11 8l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HermesChat() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [typingMessage, setTypingMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isImageLoading, setIsImageLoading] = useState(false)
  const [isChatStart, setIsChatStart] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: createMessageId(),
      role: 'assistant',
      content: STARTER_MESSAGE,
    },
  ])
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const appendAssistantMessage = (content: string, image?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: createMessageId(),
        role: 'assistant',
        content,
        image,
      },
    ])
  }

  useEffect(() => {
    if (!chatContainerRef.current) {
      return
    }
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [messages, typingMessage, isTyping, isImageLoading])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const isSlashShortcut =
        event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
      if (!isSlashShortcut || isTypingTarget(event.target)) {
        return
      }
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.body.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!copiedId) {
      return
    }
    const timeout = window.setTimeout(() => {
      setCopiedId(null)
    }, 1200)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [copiedId])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const value = input.trim()
    if (!value || loading) {
      return
    }

    setIsChatStart(false)
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: value,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)
    setTypingMessage('')
    setIsTyping(false)

    try {
      if (/^(image|dali):\s*/i.test(value)) {
        const prompt = value.replace(/^(image|dali):\s*/i, '')
        setIsImageLoading(true)

        const response = await fetch('/api/openai/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: prompt }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error ?? 'Failed to generate image.')
        }

        appendAssistantMessage('Here is your generated image:', data.image)
      } else {
        const response = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [...messages, userMessage] }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error ?? 'Failed to get a response.')
        }

        if (!response.body) {
          throw new Error('No response stream returned.')
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentMessage = ''

        while (true) {
          const { done, value: chunkValue } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(chunkValue, { stream: true })
          let newLineIndex = buffer.indexOf('\n')
          while (newLineIndex !== -1) {
            const line = buffer.slice(0, newLineIndex).trim()
            buffer = buffer.slice(newLineIndex + 1)

            if (line) {
              try {
                const data = JSON.parse(line)
                const content = data?.choices?.[0]?.delta?.content
                if (typeof content === 'string' && content.length > 0) {
                  currentMessage += content
                  setTypingMessage(currentMessage)
                  setIsTyping(true)
                }
              } catch {
                // Ignore malformed stream line and continue.
              }
            }
            newLineIndex = buffer.indexOf('\n')
          }
        }

        setIsTyping(false)
        setTypingMessage('')
        appendAssistantMessage(currentMessage || 'No response returned.')
      }
    } catch (error) {
      appendAssistantMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong while processing your request.',
      )
    } finally {
      setIsTyping(false)
      setTypingMessage('')
      setIsImageLoading(false)
      setLoading(false)
    }
  }

  async function copyMessage(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
    } catch {
      // No-op. Clipboard APIs can fail in restricted contexts.
    }
  }

  function handleInputBlur() {
    const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
    if (!isCoarsePointer) {
      return
    }
    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }, 0)
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-100 p-4 dark:border-zinc-700/40">
      <div
        ref={chatContainerRef}
        className="min-h-0 flex-1 space-y-4 overflow-auto p-2"
      >
        {messages.map((message, index) => (
          <div key={message.id} className="chat-message">
            <div
              className={`flex items-end ${
                message.role === 'assistant' ? '' : 'justify-end'
              }`}
            >
              <div
                className={`mx-1 max-w-[92%] space-y-2 text-sm lg:max-w-[80%] ${
                  message.role === 'assistant' ? 'items-start' : 'items-end'
                }`}
              >
                <span
                  className={`inline-block rounded-xl px-4 py-2.5 ${
                    message.role === 'assistant'
                      ? 'rounded-bl-none bg-teal-600 text-white'
                      : 'rounded-br-none bg-zinc-500 text-white dark:bg-zinc-600'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="max-w-none text-white">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {message.content}
                    </span>
                  )}
                  {message.image && (
                    <Image
                      src={message.image}
                      alt="Generated image"
                      width={512}
                      height={512}
                      className="mt-3 rounded-lg"
                      unoptimized
                    />
                  )}
                </span>
                {message.role === 'assistant' &&
                  index > 0 &&
                  !message.image && (
                    <button
                      type="button"
                      onClick={() => copyMessage(message.id, message.content)}
                      className="inline-flex items-center gap-1 rounded px-1 text-xs text-zinc-500 hover:text-teal-600 dark:text-zinc-400 dark:hover:text-teal-400"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                      <span>{copiedId === message.id ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        ))}

        {isImageLoading && (
          <div className="chat-message">
            <div className="flex items-end">
              <div className="mx-1 max-w-[92%] text-sm lg:max-w-[80%]">
                <span className="inline-block animate-pulse rounded-xl rounded-bl-none bg-teal-500 px-4 py-2.5 text-white">
                  Let&apos;s consult Salvador... 🧑‍🎨
                </span>
              </div>
            </div>
          </div>
        )}

        {isTyping && (
          <div className="chat-message">
            <div className="flex items-end">
              <div className="mx-1 max-w-[92%] text-sm lg:max-w-[80%]">
                <span className="inline-block animate-pulse rounded-xl rounded-bl-none bg-teal-500 px-4 py-2.5 text-white">
                  {typingMessage || 'Thinking'}...
                </span>
              </div>
            </div>
          </div>
        )}

        {isChatStart && (
          <div className="space-y-3 pt-1">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Examples
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setInput(example)
                    inputRef.current?.focus()
                  }}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onBlur={handleInputBlur}
            disabled={loading}
            placeholder="Ask Hermes..."
            className="w-full rounded-md px-3 py-2 pr-10 text-base outline outline-zinc-300 focus:outline-teal-500 disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm dark:bg-zinc-800 dark:outline-zinc-600"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 hidden items-center text-xs font-medium text-zinc-400 sm:inline-flex dark:text-zinc-500">
            /
          </span>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md bg-teal-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-400 active:bg-teal-600 disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-400 dark:active:bg-teal-600"
        >
          {loading ? (
            <span className="tracking-widest">...</span>
          ) : (
            <>
              <span>Send</span>
              <SendIcon className="h-4 w-4" />
            </>
          )}
        </button>
      </form>
    </div>
  )
}

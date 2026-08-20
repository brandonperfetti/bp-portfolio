'use client'

import { useState } from 'react'

import { Button } from '@/components/Button'
import { MailIcon } from '@/icons'
import { useTurnstileToken } from '@/lib/security/useTurnstileToken'

export function Messenger() {
  const [fullname, setFullname] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  // Mailing-list opt-in — deliberately unchecked by default (explicit
  // consent only; the server ignores captures without this flag).
  const [subscribe, setSubscribe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [feedback, setFeedback] = useState('')
  // Invisible bot check; enforced server-side only when Turnstile keys are
  // configured, so the form works identically in dev/preview without them.
  const { containerRef: turnstileRef, getToken } = useTurnstileToken({
    enabled: true,
  })
  const fieldClassName =
    'w-full min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-base text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:outline-none sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10'

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setFeedback('')

    try {
      const turnstileToken = await getToken()
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullname,
          email,
          subject,
          message,
          subscribe,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        setStatus('error')
        setFeedback(data.message ?? 'Unable to send your message right now.')
      } else {
        setStatus('success')
        setFeedback('Thanks. Your message has been delivered.')
        setFullname('')
        setEmail('')
        setSubject('')
        setMessage('')
        setSubscribe(false)
      }
    } catch {
      setStatus('error')
      setFeedback('Unable to send your message right now.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-zinc-100 p-6 dark:border-zinc-700/40"
    >
      <h2 className="flex text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <MailIcon className="h-6 w-6 flex-none" />
        <span className="ml-3">Send a message</span>
      </h2>
      <div className="mt-6">
        <div className="flex-row py-2">
          <input
            type="text"
            placeholder="Full Name"
            value={fullname}
            onChange={(event) => setFullname(event.target.value)}
            required
            className={fieldClassName}
          />
        </div>
        <div className="flex-row py-2">
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className={fieldClassName}
          />
        </div>
        <div className="flex-row py-2">
          <input
            type="text"
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            required
            className={fieldClassName}
          />
        </div>
        <div className="flex-row py-2">
          <textarea
            placeholder="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            rows={4}
            className={fieldClassName}
          />
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <input
          type="checkbox"
          checked={subscribe}
          onChange={(event) => setSubscribe(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-teal-700 dark:border-zinc-600"
        />
        <span>
          Keep me posted when new articles are published. Unsubscribe anytime.
        </span>
      </label>
      {/* Turnstile mount point — empty unless Cloudflare escalates to an
          interactive challenge, so it costs no layout otherwise. */}
      <div ref={turnstileRef} className="empty:hidden [&:not(:empty)]:py-2" />
      <div className="mt-4">
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Sending...' : 'Send'}
        </Button>
      </div>
      {feedback && (
        <p
          className={`mt-3 text-sm ${status === 'success' ? 'text-emerald-500' : 'text-red-500'}`}
        >
          {feedback}
        </p>
      )}
    </form>
  )
}

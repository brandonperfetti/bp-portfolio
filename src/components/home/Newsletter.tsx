'use client'

import { useState } from 'react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'

import { Button } from '@/components/Button'
import { MailIcon } from '@/icons'
import { useTurnstileToken } from '@/lib/security/useTurnstileToken'

/**
 * The "Stay up to date" card: one email field that joins the mailing list.
 *
 * @remarks Posts to `/api/newsletter` (#367), which emails the address a
 * link to confirm (double opt-in, #407); only that confirmation adds it to
 * the Resend list the sign-up and contact-form opt-ins use. There is no
 * checkbox; the copy says what joining means. The server's answer is shown
 * as given: it is the same for a new address and one already on the list. The Turnstile check is invisible unless
 * Cloudflare escalates, and enforced server-side only when its keys are set.
 */
export function Newsletter() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState<boolean | null>(null)
  const { containerRef: turnstileRef, getToken } = useTurnstileToken({
    enabled: true,
  })

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const turnstileToken = await getToken()
      const response = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      })

      const data = (await response.json().catch(() => ({}))) as {
        message?: string
      }
      if (!response.ok) {
        setSuccess(false)
        setMessage(data.message ?? 'Unable to subscribe right now.')
      } else {
        setSuccess(true)
        setMessage(data.message ?? 'Check your inbox for a link to confirm.')
        setEmail('')
      }
    } catch {
      setSuccess(false)
      setMessage('Unable to subscribe right now.')
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
        <span className="ml-3">Stay up to date</span>
      </h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Get notified when I publish something new, and unsubscribe at any time.
      </p>
      <div className="mt-6 flex">
        <input
          type="email"
          placeholder="Email address"
          aria-label="Email address"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-base text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:outline-none sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
        />
        <div className="ml-2">
          <Button type="submit" disabled={loading} aria-label="Subscribe">
            {!loading ? <ArrowRightIcon className="h-5 w-5" /> : '...'}
          </Button>
        </div>
      </div>
      {/* Turnstile mount point — empty unless Cloudflare escalates to an
          interactive challenge. */}
      <div ref={turnstileRef} className="empty:hidden [&:not(:empty)]:pt-3" />
      {/* Always mounted, so the live region exists before its first message
          and screen readers announce that one too. */}
      <p
        role="status"
        aria-live="polite"
        className={
          message
            ? `mt-3 text-sm ${success ? 'text-emerald-500' : 'text-red-500'}`
            : undefined
        }
      >
        {message}
      </p>
    </form>
  )
}

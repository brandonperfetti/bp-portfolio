'use client'

import { useState } from 'react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'

import { Button } from '@/components/Button'
import { MailIcon } from '@/icons'

export function Newsletter() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState<boolean | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/mailinglist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mail: email }),
      })

      const data = await response.json()
      if (!response.ok) {
        setSuccess(false)
        setMessage(
          data.error
            ? `${data.message ?? 'Unable to subscribe right now.'} (${data.error})`
            : (data.message ?? 'Unable to subscribe right now.'),
        )
      } else {
        setSuccess(true)
        setMessage(data.message ?? 'Subscribed successfully.')
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
          className="min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 focus:outline-none sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
        />
        <div className="ml-2">
          <Button type="submit" disabled={loading}>
            {!loading ? <ArrowRightIcon className="h-5 w-5" /> : '...'}
          </Button>
        </div>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${success ? 'text-emerald-500' : 'text-red-500'}`}
        >
          {message}
        </p>
      )}
    </form>
  )
}

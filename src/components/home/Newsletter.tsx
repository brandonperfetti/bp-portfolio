'use client'
import Button from '@/components/common/Button'
import { MailIcon } from '@/icons'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Spinner } from '../common'

export default function Newsletter() {
  const [mail, setMail] = useState('') // Initialize as an empty string
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<boolean>()
  const [messageState, setMessageState] = useState('')

  const Subscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await fetch('/api/mailinglist', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mail }),
      })
      const data = await response.json()
      if (response.ok) {
        setSuccess(true)
        setMessageState(data.message)
        setMail('') // Clear email input
        setTimeout(() => setMessageState(''), 5000)
      } else {
        setSuccess(false)
        setMessageState(
          data.message ||
            'An error occurred while subscribing to the newsletter.',
        )
        setTimeout(() => setMessageState(''), 5000)
      }
    } catch (error) {
      setSuccess(false)
      setMessageState(
        error instanceof Error ? error.message : 'An unknown error occurred',
      )
      setTimeout(() => setMessageState(''), 5000)
    }
    setLoading(false)
  }

  return (
    <form
      onSubmit={Subscribe}
      action="/thank-you"
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
          value={mail} // Bind input value to the state
          onChange={(e) => setMail(e.target.value)}
          required
          className="min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
        />
        <div className="ml-2">
          <Button type="submit" disabled={loading}>
            {!loading ? (
              <ArrowRightIcon className="h-5 w-4" />
            ) : (
              <div className="w-4">
                <Spinner />
              </div>
            )}
          </Button>
        </div>
      </div>
      {messageState && (
        <p
          className={`mt-2 text-sm ${success ? 'text-green-400' : 'text-red-500'}`}
        >
          {messageState}
        </p>
      )}
    </form>
  )
}

'use client'

import { useState } from 'react'

import { Button } from '@/components/Button'

type Result =
  'confirmed' | 'expired' | 'invalid' | 'used' | 'failed' | 'incomplete'

/** What the page says after each answer from `/api/newsletter/confirm`. */
const RESULT_COPY: Record<Result, string> = {
  confirmed:
    "You're subscribed. I'll email you when I publish something new, and you can unsubscribe any time.",
  expired: 'This link has expired. Sign up again and I’ll send you a new one.',
  invalid: "This link doesn't work. Sign up again and I’ll send you a new one.",
  used: 'This link has already been used. To sign up again, use the form and I’ll send you a new one.',
  failed: "Couldn't confirm right now. Please try again in a few minutes.",
  incomplete:
    "Couldn't finish confirming. Sign up again in a few minutes and I’ll send you a new link.",
}

function tokenFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('token')
}

/**
 * The confirm button on `/newsletter/confirm`, the second step of the
 * Newsletter Signup's double opt-in (#407).
 *
 * @param props - `readToken` says where the link's token comes from; it
 *   defaults to the page's `?token=`, and stories and tests pass their own.
 *
 * @remarks **A button, not a confirm-on-load.** Mail scanners open links in
 * incoming mail; if opening the link confirmed, whoever the mail reached
 * would be subscribed without asking. Only pressing the button posts the
 * token. The token is read when the button is pressed, not during render,
 * so the page stays static and no token passes through the server render.
 */
export function ConfirmSubscription({
  readToken = tokenFromLocation,
}: {
  readToken?: () => string | null
}) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function confirm() {
    const token = readToken()
    if (!token) {
      setResult('invalid')
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/newsletter/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        status?: string
      }
      setResult(
        data.status && data.status in RESULT_COPY
          ? (data.status as Result)
          : 'failed',
      )
    } catch {
      setResult('failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Hidden once the answer is final: pressing again cannot change it. */}
      {result === null || result === 'failed' ? (
        <Button type="button" onClick={confirm} disabled={loading}>
          {loading ? 'Confirming…' : 'Confirm'}
        </Button>
      ) : null}
      {/* Always mounted, so screen readers announce the first result too. */}
      <p
        role="status"
        aria-live="polite"
        className={
          result
            ? `mt-6 text-base ${
                result === 'confirmed'
                  ? 'text-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`
            : undefined
        }
      >
        {result ? RESULT_COPY[result] : null}
      </p>
    </div>
  )
}

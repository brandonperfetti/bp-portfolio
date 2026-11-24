'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react'

import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleIcon } from '@/icons'

/**
 * The pieces the custom sign-up (#377) and sign-in (#379) forms share, so
 * `/sign-up` and `/sign-in` read as one pair: one card, one error style,
 * one Google button, one password field and one code step.
 *
 * Free of Clerk, like the views that use them.
 */

/** The card both auth forms sit in. */
export const AUTH_CARD_CLASS =
  'w-full max-w-[25rem] rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8'

/** A message under a field, or above the submit button. */
export const AUTH_ERROR_CLASS = 'text-sm text-destructive'

/** An inline link inside the card (to the other auth page). */
export const AUTH_LINK_CLASS =
  'font-medium text-link-accent underline-offset-4 hover:underline'

/** What a form knows about a one-time code's delivery. */
export type CodeDelivery = 'sent' | 'failed' | 'unknown'

/**
 * The card's frame.
 *
 * @param props - `children`: The step on show.
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return <div className={AUTH_CARD_CLASS}>{children}</div>
}

/**
 * The heading block at the top of each step.
 *
 * @param props - `id`: The id the step's `<form aria-labelledby>` points at.
 */
export function AuthHeading({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="text-center">
      <h1 id={id} className="text-lg font-semibold">
        {title}
      </h1>
      {children ? (
        <p className="mt-1 text-sm text-muted-foreground">{children}</p>
      ) : null}
    </div>
  )
}

/**
 * Messages that belong to no field, announced as an alert.
 *
 * @param props - `messages`: Already in words; nothing renders when empty.
 */
export function GlobalErrors({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <div role="alert" className={`${AUTH_ERROR_CLASS} space-y-1`}>
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  )
}

/**
 * "Continue with Google" and the "or" rule under it.
 *
 * @param props - `onClick`: Receives the click, so a caller can read its form.
 */
export function GoogleButton({
  onClick,
}: {
  onClick: ComponentProps<'button'>['onClick']
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
      >
        <GoogleIcon className="size-4" />
        Continue with Google
      </Button>

      <div
        aria-hidden="true"
        className="flex items-center gap-3 text-xs text-muted-foreground"
      >
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  )
}

/**
 * A labelled text field with its error under it.
 *
 * @remarks The error is tied to the input by `aria-describedby` and marks it
 * `aria-invalid`, so a screen reader reads it with the field.
 */
export function AuthField({
  id,
  label,
  error,
  inputRef,
  ...input
}: {
  id: string
  label: string
  error?: string
  inputRef?: Ref<HTMLInputElement>
} & Omit<ComponentProps<'input'>, 'id' | 'ref'>) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
      />
      {error ? (
        <p id={`${id}-error`} className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A password field with a show/hide toggle, an optional hint, its error,
 * and an optional action beside the label (sign-in's "Forgot password?").
 *
 * @param props - `autoComplete`: `current-password` to sign in,
 *   `new-password` to make one, so password managers offer the right thing.
 */
export function PasswordField({
  id,
  label = 'Password',
  value,
  onChange,
  autoComplete,
  hint,
  error,
  inputRef,
  labelAction,
}: {
  id: string
  label?: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  hint?: string
  error?: string
  inputRef?: Ref<HTMLInputElement>
  labelAction?: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type={shown ? 'text' : 'password'}
          name="password"
          autoComplete={autoComplete}
          required
          className="pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
        />
        <button
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((was) => !was)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {shown ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={AUTH_ERROR_CLASS}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The line under a code step's heading, which never says a code was sent
 * when this page did not see it sent (#384).
 *
 * @param codeDelivery - `sent`: this page asked Clerk to send one and Clerk
 *   accepted. `failed`: it asked and Clerk refused. `unknown`: the page did
 *   not see a send (a reload, a return from Google), so the line claims
 *   neither.
 */
export function CodeDeliveryLine({
  codeDelivery,
  email,
}: {
  codeDelivery: CodeDelivery
  email?: string
}) {
  return (
    <>
      {codeDelivery === 'failed'
        ? "We couldn't send a code to "
        : codeDelivery === 'unknown'
          ? 'Enter the verification code for '
          : 'Enter the code we sent to '}
      {email ? (
        <span className="font-medium break-all text-card-foreground">
          {email}
        </span>
      ) : (
        'your email address'
      )}
      .
      {codeDelivery === 'failed'
        ? ' Choose "Send a new code" to try again.'
        : codeDelivery === 'unknown'
          ? ' If you don\'t have one, choose "Send a new code".'
          : null}
    </>
  )
}

/** Props of {@link CodeStep}. */
export type CodeStepProps = {
  title: string
  /** A sentence before the delivery line, such as why a code is asked for. */
  intro?: string
  email?: string
  codeDelivery: CodeDelivery
  pending: boolean
  codeError?: string
  globalErrors?: string[]
  /** A polite status line, such as "a new code was sent". */
  notice?: string
  submitLabel: string
  pendingLabel: string
  /** The way out of this step, such as "Use a different email". */
  backLabel: string
  onVerify: (code: string) => void
  onResend: () => void
  onBack: () => void
}

/**
 * One step that takes an emailed one-time code: sign-up's email check, and
 * sign-in's email code, new-device check and password reset.
 *
 * @remarks Arriving on the step, and every rejected code, lands focus on the
 * code field. A disabled field cannot take focus, so this also runs when the
 * step unlocks after a request made from it (a rejected code, a new code).
 */
export function CodeStep({
  title,
  intro,
  email,
  codeDelivery,
  pending,
  codeError,
  globalErrors,
  notice,
  submitLabel,
  pendingLabel,
  backLabel,
  onVerify,
  onResend,
  onBack,
}: CodeStepProps) {
  const id = useId()
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!pending) codeRef.current?.focus()
  }, [pending, codeError])

  return (
    <form
      aria-labelledby={`${id}-title`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onVerify(code.trim())
      }}
    >
      <AuthHeading id={`${id}-title`} title={title}>
        {intro ? `${intro} ` : null}
        <CodeDeliveryLine codeDelivery={codeDelivery} email={email} />
      </AuthHeading>

      <fieldset disabled={pending} className="mt-6 flex min-w-0 flex-col gap-5">
        <AuthField
          id={`${id}-code`}
          inputRef={codeRef}
          label="Verification code"
          error={codeError}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />

        <GlobalErrors messages={globalErrors} />

        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {notice}
        </p>

        <Button type="submit" className="w-full">
          {pending ? pendingLabel : submitLabel}
        </Button>

        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2">
          <Button type="button" variant="link" size="sm" onClick={onResend}>
            Send a new code
          </Button>
          <Button type="button" variant="link" size="sm" onClick={onBack}>
            {backLabel}
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

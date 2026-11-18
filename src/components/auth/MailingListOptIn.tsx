'use client'

import { useId } from 'react'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

/**
 * The mailing-list checkbox shown beside the sign-up form (#362): the contact
 * form's question, in the contact form's words and styling.
 *
 * @remarks Controlled and free of Clerk, so it can be rendered, tested and
 * shown in Storybook without a Clerk instance; `SignUpWithOptIn` owns the
 * state and hands it to Clerk. It never defaults itself to ticked: the caller
 * passes the state, and the only caller starts at `false`.
 */
export function MailingListOptIn({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const checkboxId = useId()
  return (
    <label
      htmlFor={checkboxId}
      className="flex w-full max-w-sm cursor-pointer items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-teal-700 dark:border-zinc-600"
      />
      <span>{MAILING_LIST_OPT_IN_LABEL}</span>
    </label>
  )
}

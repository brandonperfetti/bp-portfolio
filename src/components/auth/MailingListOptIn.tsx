'use client'

import { useId } from 'react'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

/**
 * The mailing-list checkbox inside the sign-up form (#362, #377): the contact
 * form's question, in the contact form's words and styling.
 *
 * @remarks Controlled and free of Clerk, so it can be rendered, tested and
 * shown in Storybook without a Clerk instance; `SignUpFormView` owns the
 * state. It never defaults itself to ticked: the caller passes the state, and
 * the only caller starts at `false`.
 *
 * `name` puts the box in its form's data, which is how the sign-up form reads
 * the tick at the moment of submit instead of from a render that may be a
 * frame old. It takes no `disabled` prop: the sign-up form disables it
 * through its `<fieldset>`, and the classes below dim it when that happens.
 */
export function MailingListOptIn({
  checked,
  onChange,
  name,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  name?: string
}) {
  const checkboxId = useId()
  return (
    <label
      htmlFor={checkboxId}
      className="flex w-full max-w-sm cursor-pointer items-start gap-2 text-sm text-zinc-600 has-disabled:cursor-not-allowed has-disabled:opacity-60 dark:text-zinc-400"
    >
      <input
        id={checkboxId}
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-teal-700 disabled:cursor-not-allowed dark:border-zinc-600"
      />
      <span>{MAILING_LIST_OPT_IN_LABEL}</span>
    </label>
  )
}

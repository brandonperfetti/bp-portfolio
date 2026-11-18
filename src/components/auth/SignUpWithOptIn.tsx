'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

import { SignUp } from '@clerk/nextjs'

import { MAILING_LIST_OPT_IN_KEY } from '@/lib/email/mailingListOptIn'

import { MailingListOptIn } from './MailingListOptIn'

const SIGN_UP_PATH = '/sign-up'

/**
 * Clerk's `<SignUp>` with the site's mailing-list opt-in above it (#362).
 *
 * @remarks
 * Until #362 every new account was added to the Resend list; the contact form,
 * which feeds the same list, asked first. This asks the same question in the
 * same words (`MAILING_LIST_OPT_IN_LABEL`), unticked by default, and only a
 * ticked box joins.
 *
 * **How the answer travels.** Clerk's prebuilt component takes no custom
 * fields, but it does take `unsafeMetadata`, which it sends with the sign-up
 * and copies onto the created user. The Clerk webhook reads it back from the
 * `user.created` payload (`hasMailingListOptIn`) and captures a contact only
 * for a literal `true`. No Clerk dashboard setting is involved. The value is
 * always sent, `false` included, so an unticked sign-up is an explicit "no"
 * in Clerk and not merely a missing field.
 *
 * **The box is shown only on the first step.** The metadata goes out with the
 * request that starts the sign-up. On the later steps of the same flow (the
 * email-code screen lives under `/sign-up/…`) that request has already been
 * made, so a box there would be one the visitor could tick to no effect.
 * Hiding it keeps the promise honest; the state is kept, so going back shows
 * the choice as it was left.
 *
 * **The box comes before the form, in the page and in the DOM.** A visitor
 * tabbing through reaches it before Clerk's Continue button, so the choice is
 * made before the request that carries it can be sent. The state cannot be
 * locked while that request is in flight (Clerk's prebuilt component reports
 * no submit event), so a tick changed in those few hundred milliseconds may
 * not be the one sent; the box is gone on the next step either way.
 *
 * A sign-up that never passes this screen (a social sign-in started on
 * `/sign-in` that creates the account, an account made in the dashboard) has
 * no opt-in and stays off the list. Fail-closed is the intended outcome.
 */
export function SignUpWithOptIn() {
  const [optIn, setOptIn] = useState(false)
  const pathname = usePathname()
  const onFirstStep = pathname === SIGN_UP_PATH

  return (
    <div className="flex flex-col items-center gap-4">
      {onFirstStep ? (
        <MailingListOptIn checked={optIn} onChange={setOptIn} />
      ) : null}
      <SignUp
        path={SIGN_UP_PATH}
        routing="path"
        signInUrl="/sign-in"
        unsafeMetadata={{ [MAILING_LIST_OPT_IN_KEY]: optIn }}
      />
    </div>
  )
}

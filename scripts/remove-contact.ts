import { Resend } from 'resend'

import { removeContactByEmail } from '../src/lib/email/resendContacts'

/**
 * Remove one address from the mailing list: the one-step answer to "please
 * remove me" from a subscriber with no account, such as a contact-form
 * opt-in (#365; `docs/AUTH.md` § Leaving the list).
 *
 * @remarks A thin wrapper over `removeContactByEmail`, which reuses the
 * webhook's `removeContact`: a removal, never a suppression, so the address
 * can still receive transactional mail and can join again later.
 *
 * Usage:
 *   pnpm exec payload run scripts/remove-contact.ts -- <address>
 *
 * `pnpm exec`, not `pnpm payload`: the package script echoes the expanded
 * command, and so the address, before the script runs.
 *
 * The `--` is load-bearing, as in `backfill-clerk-resend-mapping.ts`:
 * `payload run` keeps only positional arguments for the script. Requires
 * `RESEND_API_KEY` for the environment whose list it edits, and exactly one
 * address. It prints the outcome (`removed`, `absent` or `unconfirmed`) and
 * exits 1 on `unconfirmed`. It sets `NODE_ENV=production` for itself, so the
 * Resend SDK's error log, which prints the request path and so the address,
 * stays off.
 */

/** The script's own arguments, without `payload run`'s `--` separator. */
const args = process.argv.slice(2).filter((arg) => arg !== '--')

/** A plain address: one `@`, no spaces or angle brackets. */
const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Remove the address given on the command line and report what happened. */
async function run(): Promise<boolean> {
  // Exactly one plain address: with two, which one was meant is a guess.
  const email = args.length === 1 ? args[0] : undefined
  if (!email || !ADDRESS.test(email)) {
    console.error(
      'Usage: pnpm exec payload run scripts/remove-contact.ts -- <one email address>',
    )
    return false
  }
  // The Resend SDK logs each failed request's path, which holds the address,
  // unless NODE_ENV is production; this script never wants that log.
  Object.assign(process.env, { NODE_ENV: 'production' })
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[remove-contact] RESEND_API_KEY is required')
    return false
  }
  const outcome = await removeContactByEmail(
    new Resend(apiKey),
    email,
    'remove-contact script (#365)',
  )
  const said = {
    removed: 'removed from the list',
    absent: 'not on the list; nothing to do',
    unconfirmed:
      'NOT confirmed: it may or may not still be on the list; check the Resend dashboard or run again',
  }[outcome]
  console.info(`[remove-contact] ${outcome}: ${said}`)
  return outcome !== 'unconfirmed'
}

// `payload run` kills floating promises after module evaluation, so the
// top-level await is required (as in the backfill script).
process.exit((await run()) ? 0 : 1)

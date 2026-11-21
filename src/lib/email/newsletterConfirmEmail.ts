import { getSiteUrl } from '@/lib/site'

/** The path of the page a confirmation link opens. */
export const CONFIRM_PAGE_PATH = '/newsletter/confirm'

/**
 * The confirmation email for a Newsletter Signup submit (double opt-in).
 *
 * @param token - From `createConfirmToken`; base64url, so URL-safe as is.
 * @returns The subject, plain text and HTML Resend sends.
 *
 * @remarks Says what the reader is signing up for and that ignoring it does
 * nothing, since anyone can type any address into the form. The link opens
 * a page with a button rather than confirming on load, because mail
 * scanners open links in incoming mail, and a link that confirmed on load
 * would subscribe whoever the mail reached. The token is the only dynamic
 * part, and it is base64url, so it needs no HTML escaping.
 */
export function buildConfirmEmail(token: string): {
  subject: string
  text: string
  html: string
} {
  const url = `${getSiteUrl()}${CONFIRM_PAGE_PATH}?token=${token}`
  return {
    subject: 'Confirm your subscription',
    text: [
      'Hi,',
      '',
      'Someone, hopefully you, asked to get an email from brandonperfetti.com when I publish something new.',
      '',
      `To confirm, open this link and press Confirm: ${url}`,
      '',
      "If that wasn't you, ignore this email. Nothing happens unless you confirm, and the link stops working in 3 days.",
      '',
      'Brandon',
    ].join('\n'),
    html: `
      <p>Hi,</p>
      <p>Someone, hopefully you, asked to get an email from brandonperfetti.com when I publish something new.</p>
      <p><a href="${url}">Confirm your subscription</a></p>
      <p>If that wasn't you, ignore this email. Nothing happens unless you confirm, and the link stops working in 3 days.</p>
      <p>Brandon</p>
    `,
  }
}

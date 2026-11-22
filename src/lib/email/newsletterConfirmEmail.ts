import { getSiteUrl } from '@/lib/site'

/** The path of the page a confirmation link opens. */
export const CONFIRM_PAGE_PATH = '/newsletter/confirm'

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).host
  } catch {
    return null
  }
}

/**
 * The origin a confirmation link should point at: the deployment that took
 * the sign-up, when it is one of this site's own hosts.
 *
 * @param req - The sign-up request.
 * @returns `https://<serving host>` (or `http://` for localhost), else
 * {@link getSiteUrl}.
 *
 * @remarks **Why not `getSiteUrl()` alone.** Staging and preview keep
 * `NEXT_PUBLIC_SITE_URL` pointed at production (`isAllowedRequestSource` in
 * `guardrails.ts`), and each environment seals tokens with its own
 * `PAYLOAD_SECRET`, so a staging sign-up linking to production could never
 * confirm. **Why an allowlist.** The link goes out in mail from Brandon's
 * address, so a forged `Host` must never choose where it points: only the
 * header must be a bare hostname (and port), and only the site's host and
 * its subdomains (staging), the deployment's own Vercel hosts (`VERCEL_URL`,
 * `VERCEL_BRANCH_URL`, set by the platform) and, outside production,
 * localhost are used; anything else falls back to the site URL.
 */
export function confirmLinkOrigin(req: Request): string {
  const fallback = getSiteUrl()
  const host = (
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host') ??
    ''
  )
    .split(',')[0]
    .trim()
    .toLowerCase()
  // A bare hostname and optional port, nothing else: no path, query,
  // fragment, backslash, quote or markup can ride along into the link.
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(host)) return fallback
  if (
    process.env.NODE_ENV !== 'production' &&
    /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  ) {
    return `http://${host}`
  }
  const siteHost = hostOf(fallback)
  const allowed =
    (siteHost !== null &&
      (host === siteHost || host.endsWith(`.${siteHost}`))) ||
    host === hostOf(process.env.VERCEL_URL) ||
    host === hostOf(process.env.VERCEL_BRANCH_URL)
  return allowed ? `https://${host}` : fallback
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * The confirmation email for a Newsletter Signup submit (double opt-in).
 *
 * @param token - From `createConfirmToken`; base64url, so URL-safe as is.
 * @param origin - Where the link points, from {@link confirmLinkOrigin};
 *   defaults to the site URL.
 * @returns The subject, plain text and HTML Resend sends.
 *
 * @remarks Says what the reader is signing up for and that ignoring it does
 * nothing, since anyone can type any address into the form. The link opens
 * a page with a button rather than confirming on load, because mail
 * scanners open links in incoming mail, and a link that confirmed on load
 * would subscribe whoever the mail reached. The origin is checked by
 * {@link confirmLinkOrigin} and the token is base64url, but the URL is
 * HTML-escaped in the `href` anyway, so a future caller cannot inject markup.
 */
export function buildConfirmEmail(
  token: string,
  origin: string = getSiteUrl(),
): {
  subject: string
  text: string
  html: string
} {
  const url = `${origin}${CONFIRM_PAGE_PATH}?token=${token}`
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
      <p><a href="${escapeHtml(url)}">Confirm your subscription</a></p>
      <p>If that wasn't you, ignore this email. Nothing happens unless you confirm, and the link stops working in 3 days.</p>
      <p>Brandon</p>
    `,
  }
}

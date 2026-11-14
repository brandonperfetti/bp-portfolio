import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'

import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

import configPromise from '@payload-config'

/** The one query parameter `/next/preview` reads. */
export type PreviewSearchParams = {
  path: string
}

/** The refusal every unauthorised preview request gets, whatever the cause. */
const forbidden = () =>
  new Response('You are not allowed to preview this page', { status: 403 })

/**
 * Whether `path` is a path on this site, safe to redirect to.
 *
 * @remarks `startsWith('/')` alone is not enough: `//evil.example/x` and
 * `/\evil.example/x` both start with `/` and browsers resolve them to another
 * host, which made this route an open redirect for a signed-in admin. Only a
 * single leading slash followed by something other than a slash or backslash
 * is accepted, and the result must resolve to the same origin.
 *
 * @param path - The `path` query parameter.
 * @returns True for a same-origin absolute path.
 */
export function isSameOriginPath(path: string): boolean {
  if (!/^\/(?![/\\])/.test(path)) return false
  const base = 'https://preview.invalid'
  try {
    return new URL(path, base).origin === base
  } catch {
    return false
  }
}

/**
 * Turn on Next draft mode for a signed-in Payload user and send them to the
 * page they asked to preview.
 *
 * @remarks **Authenticated by the admin's Payload session, not a URL secret
 * (#275).** The route used to require `previewSecret=<PREVIEW_SECRET>` in
 * the query string, which put a long-lived credential in dev and request
 * logs, browser history and any `Referer`. The admin's Live Preview iframe
 * and Preview button are same-origin requests that already carry the
 * `payload-token` cookie, and this route already required a Payload user, so
 * the secret added nothing the session does not prove. Now the session is
 * the whole check: no user, no draft mode.
 *
 * A cross-site link to this route can at most put the admin's OWN browser
 * into draft mode on this site; it discloses nothing to whoever sent the
 * link, and `path` cannot point off-site ({@link isSameOriginPath}).
 *
 * @param req - The incoming request.
 * @returns A redirect to `path` with draft mode on, or a refusal.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  const path = new URL(req.url).searchParams.get('path')

  if (!path) {
    return new Response('Insufficient search params', { status: 404 })
  }

  if (!isSameOriginPath(path)) {
    return new Response(
      'This endpoint can only be used for relative previews',
      { status: 400 },
    )
  }

  let user

  try {
    // Destructure the auth RESULT — payload.auth() returns
    // { user, permissions }, which is truthy even for anonymous requests.
    // Assigning the whole object made the `!user` guard below dead code
    // (found while diagnosing the preview 403s, 2026-08-10). It is now the
    // route's only gate, so it must hold on its own.
    ;({ user } = await payload.auth({
      req: req as unknown as PayloadRequest,
      headers: req.headers,
    }))
  } catch (error) {
    payload.logger.error(
      { err: error },
      'Error verifying token for live preview',
    )
    return forbidden()
  }

  const draft = await draftMode()

  if (!user) {
    draft.disable()
    return forbidden()
  }

  draft.enable()

  redirect(path)
}

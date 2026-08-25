import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse, type NextRequest } from 'next/server'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'
import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'
import { requiresConsent } from '@/lib/consent/jurisdiction'

/**
 * Consent-banner geo authority (#83). Vercel exposes edge geo as request
 * headers (Next 16 removed `request.geo`); this derives whether cookie consent
 * is legally required and writes it to the {@link CONSENT_REQUIRED_COOKIE}
 * cookie, which the client consent UI reads to decide whether to show the
 * banner (fail-closed on unknown). This replaces c15t's own (offline-mode
 * no-op) geolocation and the self-host backend, mirroring the Brytecore
 * middleware-cookie pattern. Refreshed each matched request; short TTL so a
 * travelling visitor re-resolves.
 */
const CONSENT_COOKIE_MAX_AGE_SECONDS = 60 * 60

function applyConsentGeoCookie(req: NextRequest, res: NextResponse): void {
  const required = requiresConsent({
    country: req.headers.get('x-vercel-ip-country'),
    region: req.headers.get('x-vercel-ip-country-region'),
  })
  res.cookies.set(CONSENT_REQUIRED_COOKIE, required ? 'true' : 'false', {
    path: '/',
    sameSite: 'lax',
    maxAge: CONSENT_COOKIE_MAX_AGE_SECONDS,
  })
}

/**
 * Clerk session middleware (end-user auth only — Payload admin at /admin has
 * its own auth and is excluded via the matcher) composed with the consent-geo
 * step above.
 *
 * @remarks Route protection is NOT done here: gating is enforced server-side
 * in the RSCs via {@link canAccess} (§12) — middleware only makes the session
 * available. The consent-geo step runs on the same response whether or not
 * Clerk is enabled, so the cookie is written even when Clerk keys are absent.
 * Returning `NextResponse.next()` from the Clerk handler is Clerk's supported
 * way to attach cookies/headers without dropping its session context.
 */
const middleware = isClerkEnabled()
  ? clerkMiddleware((_auth, req) => {
      const res = NextResponse.next()
      applyConsentGeoCookie(req, res)
      return res
    })
  : (req: NextRequest) => {
      const res = NextResponse.next()
      applyConsentGeoCookie(req, res)
      return res
    }

export default middleware

export const config = {
  matcher: [
    // All app routes except static assets, Next internals, the Payload
    // admin, and the Sentry tunnel (`tunnelRoute: '/monitoring'` in
    // next.config.mjs — Clerk session context is irrelevant to error/trace
    // ingestion, and running it needlessly processes every tunneled event).
    // Content routes ARE included here, so the consent-geo cookie is written
    // on normal page navigations.
    '/((?!_next|admin|api/media|monitoring|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|txt|xml|pdf|woff2?)).*)',
    // API routes that need auth context (gating-aware content APIs + AI chat).
    '/api/ai/:path*',
    '/api/search',
  ],
}

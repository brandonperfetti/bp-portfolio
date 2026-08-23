import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { isClerkEnabled } from '@/lib/auth/clerkEnabled'

/**
 * Clerk session middleware (end-user auth only — Payload admin at /admin has
 * its own auth and is excluded via the matcher).
 *
 * @remarks Route protection is NOT done here: gating is enforced server-side
 * in the RSCs via {@link canAccess} (§12) — middleware only makes the session
 * available. No-ops entirely until Clerk keys are configured.
 */
const middleware = isClerkEnabled()
  ? clerkMiddleware()
  : () => NextResponse.next()

export default middleware

export const config = {
  matcher: [
    // All app routes except static assets, Next internals, the Payload
    // admin, and the Sentry tunnel (`tunnelRoute: '/monitoring'` in
    // next.config.mjs — Clerk session context is irrelevant to error/trace
    // ingestion, and running it needlessly processes every tunneled event).
    '/((?!_next|admin|api/media|monitoring|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|css|js|txt|xml|pdf|woff2?)).*)',
    // API routes that need auth context (gating-aware content APIs + AI chat).
    '/api/ai/:path*',
    '/api/search',
  ],
}

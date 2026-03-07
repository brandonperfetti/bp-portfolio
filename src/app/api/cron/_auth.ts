import { isValidSecret } from '@/lib/security/timingSafeSecret'

function resolveBearerToken(request: Request) {
  const value = request.headers.get('authorization')?.trim() ?? ''
  const match = value.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return null
  }
  return match[1]
}

/**
 * Validates whether an incoming cron request is authorized.
 *
 * Reads `CRON_SECRET` (or fallback `CMS_REVALIDATE_SECRET`) from environment
 * and compares it against a Bearer token parsed from `Authorization` header.
 *
 * @param request Incoming HTTP request.
 * @returns `true` only when a valid expected secret exists and the provided
 * Bearer token matches via timing-safe comparison; otherwise `false`.
 *
 * Assumptions/side effects:
 * - No network I/O.
 * - Depends on process env configuration and request headers.
 * - Uses `resolveBearerToken` and `isValidSecret` for parsing/comparison.
 */
export function isAuthorizedCronRequest(request: Request) {
  const expected = process.env.CRON_SECRET || process.env.CMS_REVALIDATE_SECRET
  if (!expected) {
    return false
  }

  const provided = resolveBearerToken(request)
  if (!provided) {
    return false
  }

  return isValidSecret(provided, expected)
}

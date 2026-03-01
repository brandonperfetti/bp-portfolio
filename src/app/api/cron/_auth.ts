import { isValidSecret } from '@/lib/security/timingSafeSecret'

function resolveBearerToken(request: Request) {
  const value = request.headers.get('authorization') || ''
  const [scheme, token] = value.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token.trim()
}

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

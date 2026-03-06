import { isValidSecret } from '@/lib/security/timingSafeSecret'

function resolveBearerToken(request: Request) {
  const value = request.headers.get('authorization')?.trim() ?? ''
  const match = value.match(/^Bearer\s+(\S+)$/i)
  if (!match) {
    return null
  }
  return match[1]
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

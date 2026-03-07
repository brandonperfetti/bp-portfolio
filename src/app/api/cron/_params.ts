/**
 * Resolves optional dry-run mode from request payload + query params.
 *
 * Precedence:
 * 1) `body.dryRun` when it is an explicit boolean.
 * 2) `?dryRun=` query value (`1`/`true` => true, `0`/`false` => false).
 *
 * @returns Parsed boolean when provided in either source, otherwise `undefined`.
 */
export function parseDryRunParam(
  body: Record<string, unknown>,
  searchParams: URLSearchParams,
): boolean | undefined {
  const dryRunFromBody = typeof body.dryRun === 'boolean' ? body.dryRun : null
  if (dryRunFromBody !== null) {
    return dryRunFromBody
  }

  const dryRunFromQuery = searchParams.get('dryRun')
  if (!dryRunFromQuery) {
    return undefined
  }

  const normalized = dryRunFromQuery.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true') {
    return true
  }
  if (normalized === '0' || normalized === 'false') {
    return false
  }

  return undefined
}

export function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed)) {
    const floored = Math.floor(parsed)
    if (floored >= 1) {
      return floored
    }
  }
  return fallback
}

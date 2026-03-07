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
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

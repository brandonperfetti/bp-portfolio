import { createHash, timingSafeEqual } from 'node:crypto'

export function isValidSecret(
  provided: unknown,
  expected: string | undefined,
): boolean {
  if (typeof expected !== 'string' || expected.length === 0) {
    return false
  }

  if (typeof provided !== 'string') {
    return false
  }

  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)

  const providedDigest = createHash('sha256').update(providedBuffer).digest()
  const expectedDigest = createHash('sha256').update(expectedBuffer).digest()

  return timingSafeEqual(providedDigest, expectedDigest)
}

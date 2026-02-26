import { timingSafeEqual } from 'node:crypto'

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

  if (providedBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(providedBuffer, expectedBuffer)
}

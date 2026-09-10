import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createSessionId,
  createSessionIdFrom,
  getOrCreateSessionId,
  isSessionIdAllowed,
  SENTRY_SESSION_ID_STORAGE_KEY,
} from '@/lib/observability/sessionId'

/**
 * #213 / #168: these are the tests that make the privacy claim checkable
 * rather than assertable. "The id is not derived from any visitor
 * attribute" and "nothing account-identifying is sent" are acceptance
 * criteria; a reader should be able to see them fail if someone ever wires
 * a Clerk id, an email or a UA hash into this path.
 */

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** A minimal in-memory `sessionStorage`, one per simulated tab. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSessionId', () => {
  it('takes no inputs at all — the generator has NO parameter a visitor attribute could enter through', () => {
    // The receipt for "provably not derived": arity, and it is a real
    // arity rather than a defaulted one. The crypto stub used two cases
    // below goes through `createSessionIdFrom`, so the function the
    // application actually calls has an empty parameter list — there is
    // nowhere to put an input.
    expect(createSessionId.length).toBe(0)
    expect(createSessionId).not.toHaveLength(1)
  })

  it('returns a v4 UUID', () => {
    expect(createSessionId()).toMatch(UUID_V4)
  })

  it('returns undefined rather than a weaker substitute when crypto.randomUUID is unavailable', () => {
    // No Math.random fallback, no timestamp, no UA hash: the absence of a
    // fallback is the point. A fallback is exactly where a derived value
    // would creep in.
    expect(createSessionIdFrom({})).toBeUndefined()
    expect(createSessionIdFrom(undefined)).toBeUndefined()
  })
})

describe('getOrCreateSessionId', () => {
  it('is stable within one storage and different across two fresh ones (two tabs are two sessions)', () => {
    const tabA = fakeStorage()
    const tabB = fakeStorage()

    const first = getOrCreateSessionId(tabA)
    expect(first).toMatch(UUID_V4)
    // Same tab, second error: the SAME id, so two errors from one tab
    // count as one session (#213 AC).
    expect(getOrCreateSessionId(tabA)).toBe(first)

    const other = getOrCreateSessionId(tabB)
    expect(other).toMatch(UUID_V4)
    expect(other).not.toBe(first)
  })

  it('persists under its own namespaced key and writes nothing else', () => {
    const storage = fakeStorage()
    const id = getOrCreateSessionId(storage)
    expect(storage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)).toBe(id)
    expect(storage.length).toBe(1)
  })

  it('stores the id verbatim — nothing is appended, encoded or joined with anything about the visitor', () => {
    const storage = fakeStorage()
    const id = getOrCreateSessionId(storage)!
    expect(storage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)).toBe(id)
    expect(id).toMatch(UUID_V4)
  })

  it('returns undefined when storage throws (private mode / blocked site data) instead of breaking init', () => {
    const hostile = {
      ...fakeStorage(),
      getItem: () => {
        throw new Error('The operation is insecure.')
      },
    } as unknown as Storage
    expect(() => getOrCreateSessionId(hostile)).not.toThrow()
    expect(getOrCreateSessionId(hostile)).toBeUndefined()
  })

  it('returns undefined when there is no storage at all (server render, where globalThis.sessionStorage is absent)', () => {
    // `null`, not `undefined`: an explicit `undefined` argument re-triggers
    // the default parameter, which is exactly the jsdom storage this case
    // is meant to be without. The shipped path reaches the same guard when
    // the default expression itself evaluates to undefined.
    expect(getOrCreateSessionId(null as unknown as Storage)).toBeUndefined()
  })

  it('is gated on isSessionIdAllowed, which ships open (Sentry outside consent) — and is the ONLY place to close it', async () => {
    // #213 asks for the consent decision to be one line to flip. Assert
    // both halves of that claim: the shipped position is "allowed", and
    // `getOrCreateSessionId` genuinely consults the gate before touching
    // storage, so changing that one function body is sufficient.
    expect(isSessionIdAllowed()).toBe(true)
    expect(getOrCreateSessionId(fakeStorage())).toMatch(UUID_V4)

    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const code = (
      await readFile(
        resolve(process.cwd(), 'src/lib/observability/sessionId.ts'),
        'utf8',
      )
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(code).toMatch(/if\s*\(\s*!isSessionIdAllowed\(\)/)
  })
})

describe('#168 regression fence: nothing account-identifying is ever produced here', () => {
  it('exposes no way to pass an account, email, IP or user object in', () => {
    // #168 decided Sentry keeps no user identity. The generator and the
    // gate take nothing at all; `getOrCreateSessionId` takes only a
    // Storage (defaulted), which is why the source scan below — not this
    // arity check alone — is what pins the absence of identity inputs. A
    // future `getOrCreateSessionId(user)` has to change both to land.
    expect(createSessionId.length).toBe(0)
    expect(isSessionIdAllowed.length).toBe(0)
  })

  it('the source names no identity field — no email, username, ip_address, Clerk or Payload user', async () => {
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const source = await readFile(
      resolve(process.cwd(), 'src/lib/observability/sessionId.ts'),
      'utf8',
    )
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    for (const forbidden of [
      'email',
      'username',
      'ip_address',
      'clerk',
      'Clerk',
      'userId',
      'navigator',
      'userAgent',
      'Date.now',
      'Math.random',
    ]) {
      expect(code).not.toContain(forbidden)
    }
    // Positive control for the scan: the one thing it SHOULD find.
    expect(code).toContain('randomUUID')

    // And the shipped call site passes NO argument — the crypto seam
    // (`createSessionIdFrom`) is reached only from this test file, so the
    // "zero inputs" claim covers the real path, not just the signature.
    expect(code).toContain('createSessionId()')
    expect(code).not.toMatch(/createSessionId\([^)]/)
  })
})

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetResendContactMirrorForTests,
  forgetResendContact,
  recallResendContact,
  rememberResendContact,
  resendContactMirrorKey,
} from '@/lib/email/resendContactMirror'

/**
 * The Clerk↔Resend contact mirror (#86).
 *
 * This store exists because `user.deleted` carries `{ deleted, id, object }`
 * and nothing else — so the tests that matter are the ones about *absence*:
 * the mirror must degrade to a reportable no-op when Upstash is unset (local
 * dev), when a key was never written, and when Redis throws. Any of those
 * turning into an exception would fail the webhook's ack and put Clerk into a
 * retry loop.
 *
 * `@upstash/redis` is mocked module-wide; nothing here reaches the network.
 */

const { redisGet, redisSet, redisDel, fromEnv } = vi.hoisted(() => {
  const redisGet = vi.fn()
  const redisSet = vi.fn()
  const redisDel = vi.fn()
  return {
    redisGet,
    redisSet,
    redisDel,
    fromEnv: vi.fn(() => ({ get: redisGet, set: redisSet, del: redisDel })),
  }
})

vi.mock('@upstash/redis', () => ({ Redis: { fromEnv } }))

/** Upstash configured, as in staging/production. */
const withUpstash = () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  __resetResendContactMirrorForTests()
  redisGet.mockReset()
  redisSet.mockReset()
  redisDel.mockReset()
  fromEnv.mockClear()
})

describe('resendContactMirrorKey', () => {
  it('namespaces by owner, like the other Upstash keys in the codebase', () => {
    expect(resendContactMirrorKey('user_1')).toBe('clerk:resend-contact:user_1')
  })
})

describe('resendContactMirror — Upstash configured', () => {
  beforeEach(withUpstash)

  it('writes a contact id under the user key', async () => {
    redisSet.mockResolvedValue('OK')

    await expect(rememberResendContact('user_1', 'con_1')).resolves.toBe('ok')

    expect(redisSet).toHaveBeenCalledWith(
      'clerk:resend-contact:user_1',
      'con_1',
    )
  })

  it('overwrites an existing mapping (user.updated re-points it)', async () => {
    redisSet.mockResolvedValue('OK')

    await rememberResendContact('user_1', 'con_old')
    await rememberResendContact('user_1', 'con_new')

    expect(redisSet).toHaveBeenLastCalledWith(
      'clerk:resend-contact:user_1',
      'con_new',
    )
  })

  it('reads a stored contact id back as a hit', async () => {
    redisGet.mockResolvedValue('con_1')

    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'hit',
      contactId: 'con_1',
    })
    expect(redisGet).toHaveBeenCalledWith('clerk:resend-contact:user_1')
  })

  it('reports a miss for a key that was never written', async () => {
    redisGet.mockResolvedValue(null)

    await expect(recallResendContact('user_ghost')).resolves.toEqual({
      status: 'miss',
    })
  })

  it('reports a miss for a non-string stored value', async () => {
    // The Upstash REST client deserializes JSON, so a key written by anything
    // other than this module can come back as a number or an object. Handing
    // that to contacts.remove would be a delete built from garbage.
    redisGet.mockResolvedValue({ contactId: 'con_1' })

    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'miss',
    })
  })

  it('reports a miss for an empty stored value', async () => {
    redisGet.mockResolvedValue('')

    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'miss',
    })
  })

  it('deletes the key', async () => {
    redisDel.mockResolvedValue(1)

    await expect(forgetResendContact('user_1')).resolves.toBe('ok')
    expect(redisDel).toHaveBeenCalledWith('clerk:resend-contact:user_1')
  })

  it('reuses one client across calls', async () => {
    redisGet.mockResolvedValue('con_1')
    redisSet.mockResolvedValue('OK')

    await recallResendContact('user_1')
    await rememberResendContact('user_1', 'con_1')

    expect(fromEnv).toHaveBeenCalledTimes(1)
  })
})

describe('resendContactMirror — Redis failures never throw', () => {
  beforeEach(withUpstash)

  it('reports error instead of throwing on a failed read', async () => {
    redisGet.mockRejectedValue(new Error('ECONNRESET'))

    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'error',
    })
  })

  it('reports error instead of throwing on a failed write', async () => {
    redisSet.mockRejectedValue(new Error('ECONNRESET'))

    await expect(rememberResendContact('user_1', 'con_1')).resolves.toBe(
      'error',
    )
  })

  it('reports error instead of throwing on a failed delete', async () => {
    redisDel.mockRejectedValue(new Error('ECONNRESET'))

    await expect(forgetResendContact('user_1')).resolves.toBe('error')
  })
})

describe('resendContactMirror — Upstash absent (local dev)', () => {
  // No env stubbed: this is the state of a developer's machine and of any
  // environment that never configured Upstash. Every operation must be a
  // reportable no-op, because the webhook still has to ack.
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  })

  it('never constructs a client', async () => {
    await recallResendContact('user_1')
    await rememberResendContact('user_1', 'con_1')
    await forgetResendContact('user_1')

    expect(fromEnv).not.toHaveBeenCalled()
    expect(redisGet).not.toHaveBeenCalled()
    expect(redisSet).not.toHaveBeenCalled()
    expect(redisDel).not.toHaveBeenCalled()
  })

  it('reports unavailable — distinctly from a miss', async () => {
    // The distinction is the whole point: a miss is an unmapped user, while
    // unavailable means deletes are silently leaving contacts behind.
    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'unavailable',
    })
    await expect(rememberResendContact('user_1', 'con_1')).resolves.toBe(
      'unavailable',
    )
    await expect(forgetResendContact('user_1')).resolves.toBe('unavailable')
  })

  it('is loud exactly once per process in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    await recallResendContact('user_1')
    await rememberResendContact('user_1', 'con_1')

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(vi.mocked(console.error).mock.calls[0]?.[0]).toContain(
      'UPSTASH_REDIS_REST_URL/TOKEN missing in production',
    )
  })

  it('stays quiet outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    await recallResendContact('user_1')

    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('resendContactMirror — env is read per call, not at import', () => {
  it('picks up configuration that appears after the module loaded', async () => {
    // chatGate/limiter capture `hasUpstash` at module scope, which forces
    // their suites into vi.resetModules() + a dynamic re-import. A webhook
    // route imported at test-module load cannot do that, so this module reads
    // env inside the lazy init instead. This test pins that difference.
    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'unavailable',
    })

    withUpstash()
    redisGet.mockResolvedValue('con_1')

    await expect(recallResendContact('user_1')).resolves.toEqual({
      status: 'hit',
      contactId: 'con_1',
    })
  })
})

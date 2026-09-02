import { Redis } from '@upstash/redis'

import { boundedErrorMessage } from '@/lib/observability/boundedErrorMessage'

/**
 * The Clerk-user → Resend-contact mirror: an Upstash Redis copy of the
 * mapping the Clerk webhook writes to `external_id` (#86).
 *
 * @remarks **Why a second copy of a mapping we already store.** The webhook's
 * mapping lives on the Clerk user's `external_id`, and `user.deleted` is
 * delivered for a user that no longer exists: Clerk's payload for it is
 * `{ deleted, id, object }` — measured, and recorded in `docs/AUTH.md` — so it
 * carries no `external_id` and the Backend API cannot be asked for one either.
 * The Clerk-side mapping therefore cannot serve the one event it was built
 * for, and every real delete delivery no-oped while the contact survived. That
 * is the whole of #86's hygiene gap.
 *
 * The fix is to keep the link somewhere that outlives the Clerk user, keyed by
 * the one field the delete payload does carry: `data.id`. **This mirror is the
 * delete path's source of truth**; `external_id` remains the mapping for the
 * live user (it is what the backfill and `user.updated` read, and it is
 * visible in the Clerk dashboard).
 *
 * **Why Redis and not Postgres.** #86's own architecture constraint: Clerk
 * visitor identity never touches Postgres. Upstash keyed by user id is the
 * established store for exactly this shape of per-visitor server state
 * (`@/lib/security/chatGate`, `@/lib/security/limiter`), so this module
 * follows their conventions — an env guard, a lazily constructed singleton
 * client, and graceful absence rather than a throw.
 *
 * **Degradation is deliberate and total.** Every function here swallows its
 * failures and reports them in the returned status. A webhook must ack: Clerk
 * redelivers every non-2xx, so a Redis outage that failed the request would
 * become a retry storm against Resend. With the mirror unreachable the delete
 * path degrades to precisely the pre-#86 behavior — a distinct log line and a
 * no-op, with the contact left in the audience and reconcilable out of band.
 * Losing the Redis keyspace entirely costs the same: deletes stop cleaning up
 * and say so in the logs.
 *
 * **No TTL.** The link has to survive from sign-up until the account is
 * deleted, which is unbounded. The keyspace is bounded by user count instead —
 * one small key per signed-up user, deleted when the account is.
 */

/**
 * Outcome of a mirror operation.
 *
 * @remarks Callers log these rather than branching on them, and the
 * distinction is the point: `miss` (no mapping was ever stored for this user)
 * and `unavailable` (the store itself is not configured) both produce a no-op,
 * but only the second one means the store is silently degraded — they must not
 * read the same in production logs. `error` is a reachable store that failed,
 * which is a third, separately alarming thing.
 */
export type ResendContactMirrorStatus =
  'hit' | 'miss' | 'ok' | 'unavailable' | 'error'

/** A mirror read, carrying the contact id only on `hit`. */
export type ResendContactMirrorLookup =
  | { status: 'hit'; contactId: string }
  | { status: 'miss' | 'unavailable' | 'error'; contactId?: undefined }

let redisClient: Redis | null = null
let warnedMissingConfig = false

/**
 * The Redis key holding one user's mirrored contact id.
 *
 * @param clerkUserId - The Clerk user id (`data.id` on every `user.*` event).
 * @returns The namespaced key.
 *
 * @remarks Colon-namespaced like the other Upstash keys in this codebase
 * (`chat:anon-free:*`, and the `chat:rl` / `chat:daily` limiter prefixes), so
 * the keyspace stays greppable by owner. The user id is used raw: unlike the
 * anon-visitor keys in `chatGate`, a Clerk user id is an opaque handle rather
 * than personal data, and the delete path has to be able to derive the key
 * from the payload alone.
 */
export function resendContactMirrorKey(clerkUserId: string): string {
  return `clerk:resend-contact:${clerkUserId}`
}

/**
 * The Upstash client, or `null` when Upstash is not configured.
 *
 * @remarks Env is read on every call rather than once at module scope — the
 * one place this module deviates from `chatGate`/`limiter`. Module-scope
 * capture is what forces those suites into `vi.resetModules()` plus a dynamic
 * re-import to exercise both backends, and a webhook route imported at test
 * module load cannot do that at all. The production warning is still emitted
 * once per process, which is the property the module-scope version was really
 * buying.
 */
function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    if (process.env.NODE_ENV === 'production' && !warnedMissingConfig) {
      warnedMissingConfig = true
      console.error(
        '[resend-contact-mirror] UPSTASH_REDIS_REST_URL/TOKEN missing in production — ' +
          'user.deleted cannot resolve a contact and will no-op. Configure Upstash.',
      )
    }
    return null
  }
  if (!redisClient) {
    redisClient = Redis.fromEnv()
  }
  return redisClient
}

/**
 * Mirror a user's Resend contact id, overwriting any previous value.
 *
 * @param clerkUserId - The Clerk user id.
 * @param contactId - The Resend contact id to remember.
 * @returns `ok` on a write, `unavailable` with no store, `error` on failure.
 *
 * @remarks Last write wins by design. `user.updated` re-points the mapping at
 * a newly created contact after an email change, and the mirror has to follow
 * or the delete path would remove a contact that no longer exists while the
 * live one survived — the exact failure #86 is closing, one step later. The
 * webhook also calls this on the `external_id already set` skip path, which is
 * what lets a redelivery (or a user mapped by the backfill before this shipped)
 * converge without a second Clerk write.
 */
export async function rememberResendContact(
  clerkUserId: string,
  contactId: string,
): Promise<ResendContactMirrorStatus> {
  const redis = getRedis()
  if (!redis) return 'unavailable'
  try {
    await redis.set(resendContactMirrorKey(clerkUserId), contactId)
    return 'ok'
  } catch (error) {
    console.error('[resend-contact-mirror] write failed', {
      clerkUserId,
      contactId,
      message: boundedErrorMessage(error),
    })
    return 'error'
  }
}

/**
 * Read a user's mirrored Resend contact id.
 *
 * @param clerkUserId - The Clerk user id, taken from `data.id`.
 * @returns A `hit` carrying the contact id, or the reason there is none.
 *
 * @remarks Guards the stored value's type instead of trusting it: the Upstash
 * REST client deserializes JSON, so a key written by something other than
 * {@link rememberResendContact} could come back as a number or an object, and
 * handing that to `contacts.remove` would be a delete request built from
 * garbage.
 */
export async function recallResendContact(
  clerkUserId: string,
): Promise<ResendContactMirrorLookup> {
  const redis = getRedis()
  if (!redis) return { status: 'unavailable' }
  try {
    const value = await redis.get<unknown>(resendContactMirrorKey(clerkUserId))
    if (typeof value === 'string' && value.length > 0) {
      return { status: 'hit', contactId: value }
    }
    return { status: 'miss' }
  } catch (error) {
    console.error('[resend-contact-mirror] read failed', {
      clerkUserId,
      message: boundedErrorMessage(error),
    })
    return { status: 'error' }
  }
}

/**
 * Drop a user's mirrored contact id.
 *
 * @param clerkUserId - The Clerk user id.
 * @returns `ok` on a delete, `unavailable` with no store, `error` on failure.
 *
 * @remarks Called only *after* the contact removal succeeded. Dropping the key
 * first — or unconditionally — would discard the only surviving record of the
 * link at the moment it is still needed: the Clerk user is already gone, so a
 * manual redelivery of the failed `user.deleted` would have nothing left to
 * resolve. A key left behind by a permanently failing removal is a few bytes;
 * a key deleted too early is an unreachable contact.
 */
export async function forgetResendContact(
  clerkUserId: string,
): Promise<ResendContactMirrorStatus> {
  const redis = getRedis()
  if (!redis) return 'unavailable'
  try {
    await redis.del(resendContactMirrorKey(clerkUserId))
    return 'ok'
  } catch (error) {
    console.error('[resend-contact-mirror] delete failed', {
      clerkUserId,
      message: boundedErrorMessage(error),
    })
    return 'error'
  }
}

/**
 * Test-only reset of the cached Upstash client.
 *
 * @remarks The client is a module-scope singleton (the `chatGate` pattern), so
 * a suite that swaps the `@upstash/redis` mock or flips the env between cases
 * would otherwise keep using the client built by the first case.
 */
export function __resetResendContactMirrorForTests(): void {
  redisClient = null
  warnedMissingConfig = false
}

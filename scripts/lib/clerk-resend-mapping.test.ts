// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  formatPlan,
  indexContactsByEmail,
  mirrorTargets,
  normalizeEmail,
  planBackfill,
  primaryEmailOf,
} from './clerk-resend-mapping.mjs'

/**
 * Rules for the one-shot Clerk↔Resend mapping backfill (#86).
 *
 * The script these back writes `external_id` on real Clerk users from a match
 * made on email — the one field the two systems share and the one field
 * `user.updated` exists to change. So the interesting cases are not the happy
 * path but the four refusals: no primary email, no match, a duplicated
 * address, and a contact another user already claims. Each of those, written
 * as a mapping instead of a skip, produces a link that looks authoritative and
 * is wrong — and a wrong link is what later makes `user.deleted` remove
 * somebody else's contact.
 *
 * Pure functions over fixtures: no Clerk, no Resend, no network.
 */

/** A Clerk Backend API `User` resource (camelCase, unlike the webhook JSON). */
const user = (
  id: string,
  addresses: Array<{ id: string; emailAddress: string }>,
  extra: Record<string, unknown> = {},
) => ({
  id,
  emailAddresses: addresses,
  primaryEmailAddressId: addresses[0]?.id,
  externalId: null,
  ...extra,
})

/** A one-address user, the ordinary shape. */
const simpleUser = (
  id: string,
  email: string,
  extra: Record<string, unknown> = {},
) => user(id, [{ id: `idn_${id}`, emailAddress: email }], extra)

describe('normalizeEmail', () => {
  it('casefolds and trims', () => {
    expect(normalizeEmail('  Ada@Example.TEST ')).toBe('ada@example.test')
  })

  it('treats blank and non-string values as absent', () => {
    expect(normalizeEmail('   ')).toBeUndefined()
    expect(normalizeEmail(undefined)).toBeUndefined()
    expect(normalizeEmail(null)).toBeUndefined()
    expect(normalizeEmail(42)).toBeUndefined()
  })
})

describe('primaryEmailOf', () => {
  it('resolves primaryEmailAddressId rather than the first address', () => {
    const u = user(
      'user_1',
      [
        { id: 'idn_old', emailAddress: 'old@example.test' },
        { id: 'idn_new', emailAddress: 'new@example.test' },
      ],
      { primaryEmailAddressId: 'idn_new' },
    )

    expect(primaryEmailOf(u)).toBe('new@example.test')
  })

  it('falls back to the first address when the primary id dangles', () => {
    const u = user(
      'user_1',
      [{ id: 'idn_a', emailAddress: 'a@example.test' }],
      {
        primaryEmailAddressId: 'idn_missing',
      },
    )

    expect(primaryEmailOf(u)).toBe('a@example.test')
  })

  it('returns undefined for a user with no addresses', () => {
    expect(primaryEmailOf(user('user_1', []))).toBeUndefined()
    expect(primaryEmailOf({})).toBeUndefined()
    expect(primaryEmailOf(undefined)).toBeUndefined()
  })
})

describe('indexContactsByEmail', () => {
  it('indexes by casefolded email', () => {
    const { byEmail, ambiguous } = indexContactsByEmail([
      { id: 'con_1', email: 'Ada@Example.test' },
    ])

    expect(byEmail.get('ada@example.test')).toBe('con_1')
    expect(ambiguous).toEqual([])
  })

  it('drops an address two different contacts share', () => {
    // Resend treats an address as unique, so a duplicate means something
    // already went wrong. Picking one would be 50% wrong and invisible.
    const { byEmail, ambiguous } = indexContactsByEmail([
      { id: 'con_1', email: 'dupe@example.test' },
      { id: 'con_2', email: 'DUPE@example.test' },
      { id: 'con_3', email: 'fine@example.test' },
    ])

    expect(byEmail.has('dupe@example.test')).toBe(false)
    expect(ambiguous).toEqual(['dupe@example.test'])
    expect(byEmail.get('fine@example.test')).toBe('con_3')
  })

  it('tolerates a repeated id for one address (not a duplicate)', () => {
    const { byEmail, ambiguous } = indexContactsByEmail([
      { id: 'con_1', email: 'ada@example.test' },
      { id: 'con_1', email: 'ada@example.test' },
    ])

    expect(byEmail.get('ada@example.test')).toBe('con_1')
    expect(ambiguous).toEqual([])
  })

  it('skips malformed records instead of indexing them', () => {
    const { byEmail } = indexContactsByEmail([
      { id: 'con_1' },
      { email: 'no-id@example.test' },
      null,
      { id: 'con_2', email: 'ok@example.test' },
    ])

    expect([...byEmail.keys()]).toEqual(['ok@example.test'])
  })

  it('returns an empty index for missing input', () => {
    expect(indexContactsByEmail(undefined).byEmail.size).toBe(0)
  })
})

describe('planBackfill', () => {
  it('maps an unmapped user to the contact sharing its primary email', () => {
    const plan = planBackfill(
      [simpleUser('user_1', 'ada@example.test')],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(plan.entries).toEqual([
      {
        userId: 'user_1',
        email: 'ada@example.test',
        status: 'map',
        contactId: 'con_1',
      },
    ])
    expect(plan.summary.map).toBe(1)
  })

  it('matches across differing casing on both sides', () => {
    const plan = planBackfill(
      [simpleUser('user_1', 'Ada@Example.test')],
      [{ id: 'con_1', email: 'ada@EXAMPLE.test' }],
    )

    expect(plan.entries[0].status).toBe('map')
  })

  it('never overwrites a mapping the webhook already made', () => {
    // The backfill repairs users the webhook missed. A user with an
    // external_id is the webhook's own work and is not second-guessed.
    const plan = planBackfill(
      [simpleUser('user_1', 'ada@example.test', { externalId: 'con_webhook' })],
      [{ id: 'con_other', email: 'ada@example.test' }],
    )

    expect(plan.entries[0]).toMatchObject({
      status: 'already-mapped',
      contactId: 'con_webhook',
    })
    expect(plan.summary.map).toBe(0)
  })

  it('skips a user with no primary email', () => {
    const plan = planBackfill(
      [user('user_1', [])],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(plan.entries[0].status).toBe('no-primary-email')
  })

  it('skips a user whose address has no contact', () => {
    const plan = planBackfill([simpleUser('user_1', 'nobody@example.test')], [])

    expect(plan.entries[0].status).toBe('no-match')
  })

  it('skips a user whose address is duplicated in Resend', () => {
    const plan = planBackfill(
      [simpleUser('user_1', 'dupe@example.test')],
      [
        { id: 'con_1', email: 'dupe@example.test' },
        { id: 'con_2', email: 'dupe@example.test' },
      ],
    )

    expect(plan.entries[0].status).toBe('ambiguous')
    expect(plan.summary.ambiguous).toBe(1)
  })

  it('refuses a contact an existing mapping already claims', () => {
    // Two Clerk users pointed at one contact means the first user.deleted
    // removes the other user's contact too. This is the check that makes
    // email matching safe enough to run.
    const plan = planBackfill(
      [
        simpleUser('user_mapped', 'other@example.test', {
          externalId: 'con_1',
        }),
        simpleUser('user_2', 'ada@example.test'),
      ],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(plan.entries[1]).toMatchObject({
      status: 'conflict',
      contactId: 'con_1',
      claimedBy: 'user_mapped',
    })
    expect(plan.summary.map).toBe(0)
  })

  it('detects a conflict regardless of user order', () => {
    // The claim pass runs over every user before any matching, so an
    // already-mapped user listed AFTER the candidate still blocks it.
    const plan = planBackfill(
      [
        simpleUser('user_2', 'ada@example.test'),
        simpleUser('user_mapped', 'other@example.test', {
          externalId: 'con_1',
        }),
      ],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(plan.entries[0]).toMatchObject({
      status: 'conflict',
      claimedBy: 'user_mapped',
    })
  })

  it('gives one contact to only the first of two users claiming it', () => {
    const plan = planBackfill(
      [
        simpleUser('user_1', 'shared@example.test'),
        simpleUser('user_2', 'shared@example.test'),
      ],
      [{ id: 'con_1', email: 'shared@example.test' }],
    )

    expect(plan.entries[0].status).toBe('map')
    expect(plan.entries[1]).toMatchObject({
      status: 'conflict',
      claimedBy: 'user_1',
    })
  })

  it('summarises every status and totals them', () => {
    const plan = planBackfill(
      [
        simpleUser('user_1', 'ada@example.test'),
        simpleUser('user_2', 'mapped@example.test', { externalId: 'con_9' }),
        simpleUser('user_3', 'nobody@example.test'),
        user('user_4', []),
      ],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(plan.summary).toEqual({
      total: 4,
      map: 1,
      'already-mapped': 1,
      'no-primary-email': 1,
      'no-match': 1,
      ambiguous: 0,
      conflict: 0,
    })
  })

  it('returns an empty plan for empty input', () => {
    expect(planBackfill([], []).summary.total).toBe(0)
    expect(planBackfill(undefined, undefined).entries).toEqual([])
  })
})

describe('mirrorTargets', () => {
  it('includes newly-mapped users', () => {
    const plan = planBackfill(
      [simpleUser('user_1', 'ada@example.test')],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(mirrorTargets(plan)).toEqual([
      { userId: 'user_1', contactId: 'con_1' },
    ])
  })

  it('ALSO includes already-mapped users — the reason it exists', () => {
    // The mirror shipped after external_id did, so an already-mapped user has
    // the Clerk-side link and no mirror — and the mirror is what user.deleted
    // resolves through. Restricting this to `map` entries would leave exactly
    // the pre-existing population undeletable.
    const plan = planBackfill(
      [simpleUser('user_2', 'mapped@example.test', { externalId: 'con_9' })],
      [],
    )

    expect(plan.entries[0]?.status).toBe('already-mapped')
    expect(mirrorTargets(plan)).toEqual([
      { userId: 'user_2', contactId: 'con_9' },
    ])
  })

  it('never mirrors a status that refused to name a contact', () => {
    // planBackfill's refusals do all the deciding; this function must not
    // reintroduce a guess for no-match, ambiguous, conflict or no-email users.
    const plan = planBackfill(
      [
        simpleUser('user_nomatch', 'nobody@example.test'),
        user('user_noemail', []),
        simpleUser('user_ambiguous', 'dupe@example.test'),
        simpleUser('user_claimed', 'shared@example.test', {
          externalId: 'con_shared',
        }),
        simpleUser('user_conflict', 'shared@example.test'),
      ],
      [
        { id: 'con_a', email: 'dupe@example.test' },
        { id: 'con_b', email: 'dupe@example.test' },
        { id: 'con_shared', email: 'shared@example.test' },
      ],
    )

    expect(plan.summary['no-match']).toBe(1)
    expect(plan.summary['no-primary-email']).toBe(1)
    expect(plan.summary.ambiguous).toBe(1)
    expect(plan.summary.conflict).toBe(1)
    // Only the already-mapped user names a contact, so only it is mirrored.
    expect(mirrorTargets(plan)).toEqual([
      { userId: 'user_claimed', contactId: 'con_shared' },
    ])
  })

  it('tolerates an empty or absent plan', () => {
    expect(mirrorTargets(planBackfill([], []))).toEqual([])
    expect(mirrorTargets(undefined)).toEqual([])
  })
})

describe('formatPlan', () => {
  const plan = () =>
    planBackfill(
      [
        simpleUser('user_1', 'ada@example.test'),
        simpleUser('user_2', 'mapped@example.test', { externalId: 'con_9' }),
        simpleUser('user_3', 'nobody@example.test'),
      ],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

  it('states that a dry run wrote nothing and how to apply', () => {
    // The dry-run default is the whole safety model: the closing line has to
    // make it unambiguous that nothing happened.
    const lines = formatPlan(plan())

    expect(lines.at(-1)).toContain('Dry run: nothing was written')
    expect(lines.at(-1)).toContain('--apply')
    expect(lines.join('\n')).toContain('PLAN')
    expect(lines.join('\n')).not.toContain('MAP ')
  })

  it('switches to imperative wording under --apply', () => {
    const lines = formatPlan(plan(), { apply: true })

    expect(lines.join('\n')).toContain('MAP')
    expect(lines.at(-1)).toContain('Applying')
  })

  it('prints one line per user, naming the id and address', () => {
    const lines = formatPlan(plan())

    expect(lines[0]).toContain('user_1')
    expect(lines[0]).toContain('ada@example.test')
    expect(lines[0]).toContain('con_1')
    expect(lines[1]).toContain('already mapped to con_9')
    expect(lines[2]).toContain('no Resend contact')
  })

  it('names the blocking user on a conflict line', () => {
    const conflicted = planBackfill(
      [
        simpleUser('user_mapped', 'other@example.test', {
          externalId: 'con_1',
        }),
        simpleUser('user_2', 'ada@example.test'),
      ],
      [{ id: 'con_1', email: 'ada@example.test' }],
    )

    expect(formatPlan(conflicted)[1]).toContain(
      'contact con_1 already mapped to user_mapped',
    )
  })

  it('counts every status in the summary line', () => {
    const lines = formatPlan(plan())
    const summary = lines.at(-2) as string

    expect(summary).toContain('3 users')
    expect(summary).toContain('1 to map')
    expect(summary).toContain('1 already mapped')
    expect(summary).toContain('1 unmatched')
  })

  it('renders a user with no primary email without inventing one', () => {
    const lines = formatPlan(planBackfill([user('user_4', [])], []))

    expect(lines[0]).toContain('no primary email address')
  })
})

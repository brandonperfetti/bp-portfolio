import type { Payload } from 'payload'

/**
 * The one door every eval-tier `posts`/`pages` fixture write goes through (#191).
 *
 * @remarks **Why a helper and not a convention.** The eval tier's files run in
 * PARALLEL Vitest workers against ONE database (`evals/vitest.config.ts`
 * declares no project list, so there is no isolation boundary below the file).
 * Every cross-file assertion in the tier is therefore phrased as "everything
 * that is not one of OUR fixtures", and the only predicate that can express
 * that is the slug prefix: `post-placement-integration.test.ts`'s baseline
 * snapshot filters on `zz-`, and all three writing files sweep their own rows
 * with `slug like %MARKER%` where every `MARKER` starts `zz-`.
 *
 * Wave 6 fixed the assertion (commit `384403f`, baseline-by-id) and wrote the
 * prefix down in a docblock. A docblock is not a guard: a new fixture with an
 * unprefixed slug typechecks, passes its own file, and then silently widens
 * every sibling file's baseline — a failure that surfaces in someone else's
 * test, on a different worker, on a run that shuffled differently. So the
 * prefix is enforced here, at the write, where the stack trace names the file
 * that broke it; and `scripts/eval-harness.test.ts` fails the build if an eval
 * file calls `payload.create` for these collections without coming through
 * this module.
 *
 * **Scope: `payload.create` only.** `assertFixtureSlug` and the harness guard
 * both classify `payload.create` call sites; they do not reach `payload.update`.
 * The tier also writes `slug` through `payload.update` in several places (all
 * currently `zz-`-prefixed by hand), and an unprefixed update would widen a
 * sibling's baseline exactly as an unprefixed create would — nothing here
 * catches that. Tracked as a follow-up, not fixed here.
 */

/**
 * The slug prefix every eval-tier `posts`/`pages` fixture must carry.
 *
 * @remarks `zz-` and not something more descriptive because it is also a SORT
 * key: fixtures land at the end of any slug-ordered listing, so a leaked row
 * is visible at a glance rather than interleaved with real corpus content.
 */
export const FIXTURE_SLUG_PREFIX = 'zz-'

/**
 * Slugs the prefix rule cannot cover, and the reason each one is exempt.
 *
 * @remarks Exactly one entry, and it is not a matter of taste. The `/articles`
 * archive anchor must have the literal slug `articles` — not for its OWN path
 * (`postSlugCollidingWith('articles')` returns `null`; a page's own path never
 * collides with itself) but for its CHILDREN's: any page or post placed under
 * it lands at `articles/<slug>`, and that two-segment shape is exactly what
 * `postSlugCollidingWith` (`src/fields/slug/documentPath.ts:408-414`) matches
 * against its FIRST SEGMENT. The two guards that depend on that match —
 * `assertNotInArticlesNamespace` (`src/collections/Posts/hooks/postPlacement.ts`)
 * and the `/articles/<slug>` namespace branch of `assertNoCrossCollectionCollision`
 * (`src/fields/slug/documentPath.ts`) — both call it. A `zz-articles` anchor
 * would change the first segment and turn both cases vacuous.
 *
 * The allow-list is a `Set` rather than a boolean flag so that adding an
 * exemption is a visible edit to a reviewed list, not an argument at a call
 * site.
 */
export const RESERVED_FIXTURE_SLUGS = new Set(['articles'])

/**
 * Throw unless `slug` is a legal eval-tier fixture slug.
 *
 * @param collection - The collection being written, for the message.
 * @param slug - The slug the caller is about to store.
 *
 * @throws Error naming the convention, the offending slug, and the exemption
 *   list — everything the author needs without opening this file.
 */
export const assertFixtureSlug = (
  collection: 'pages' | 'posts',
  slug: unknown,
): void => {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error(
      `eval fixture: a ${collection} fixture must set a string slug, got ${JSON.stringify(slug)}`,
    )
  }
  if (slug.startsWith(FIXTURE_SLUG_PREFIX)) return
  if (RESERVED_FIXTURE_SLUGS.has(slug)) {
    throw new Error(
      `eval fixture: "${slug}" is a reserved anchor slug — create it through createReservedFixturePage(), not createFixture${collection === 'pages' ? 'Page' : 'Post'}()`,
    )
  }
  throw new Error(
    `eval fixture: ${collection} slug "${slug}" must start with "${FIXTURE_SLUG_PREFIX}". ` +
      `The eval tier runs its files in parallel workers against ONE database, and every cross-file ` +
      `assertion separates real corpus rows from fixtures by that prefix alone — an unprefixed fixture ` +
      `silently widens a sibling file's baseline. Prefix the slug, or add it to RESERVED_FIXTURE_SLUGS ` +
      `in evals/fixtures/payload-fixtures.ts with the reason it cannot carry one.`,
  )
}

/** What a fixture write may pass through to `payload.create`. */
type FixtureCreateArgs = {
  /** The document, which must carry a `zz-`-prefixed `slug`. */
  data: Record<string, unknown>
  /** Payload request context, e.g. `{ disableRevalidate: true }`. */
  context?: Record<string, unknown>
}

/**
 * Create a `pages` fixture, refusing an unprefixed slug.
 *
 * @param payload - An initialised Payload instance.
 * @param args - The create arguments, minus `collection` and `overrideAccess`.
 * @returns The created page, exactly as `payload.create` returned it.
 */
export const createFixturePage = async (
  payload: Payload,
  args: FixtureCreateArgs,
) => {
  assertFixtureSlug('pages', args.data.slug)
  return payload.create({
    collection: 'pages',
    overrideAccess: true,
    ...(args.context === undefined ? {} : { context: args.context }),
    data: args.data as never,
  })
}

/**
 * Create a `posts` fixture, refusing an unprefixed slug.
 *
 * @param payload - An initialised Payload instance.
 * @param args - The create arguments, minus `collection` and `overrideAccess`.
 * @returns The created post, exactly as `payload.create` returned it.
 */
export const createFixturePost = async (
  payload: Payload,
  args: FixtureCreateArgs,
) => {
  assertFixtureSlug('posts', args.data.slug)
  return payload.create({
    collection: 'posts',
    overrideAccess: true,
    ...(args.context === undefined ? {} : { context: args.context }),
    data: args.data as never,
  })
}

/**
 * Create a page at one of the {@link RESERVED_FIXTURE_SLUGS}.
 *
 * @param payload - An initialised Payload instance.
 * @param args - The create arguments; `data.slug` must be on the allow-list.
 * @returns The created page.
 *
 * @remarks Separate from {@link createFixturePage} so the exemption is spelled
 * at the call site and greppable, rather than riding in as an option nobody
 * reads. Anything not on the allow-list is rejected here too, so this is not a
 * way around the prefix.
 */
export const createReservedFixturePage = async (
  payload: Payload,
  args: FixtureCreateArgs,
) => {
  const slug = args.data.slug
  if (typeof slug !== 'string' || !RESERVED_FIXTURE_SLUGS.has(slug)) {
    throw new Error(
      `eval fixture: "${String(slug)}" is not a reserved anchor slug; use createFixturePage() with a "${FIXTURE_SLUG_PREFIX}" prefix`,
    )
  }
  return payload.create({
    collection: 'pages',
    overrideAccess: true,
    ...(args.context === undefined ? {} : { context: args.context }),
    data: args.data as never,
  })
}

/**
 * The share-destination vocabulary, in one client-safe module.
 *
 * @remarks This file MUST NOT import from `payload`, the globals, hooks, or
 * `next/*` — it is the shared floor that both the SiteSettings global (server)
 * and the client `ShareButton`/`shareTargets` value-import. Keeping the pinned
 * `{label,value}` list here, rather than in `@/globals/SiteSettings`, is what
 * lets a client component resolve share targets without dragging
 * `revalidateGlobal` → `next/cache` into the browser bundle (which breaks
 * `next build`). SiteSettings re-exports these so existing importers are
 * unaffected.
 */

/**
 * The share destinations the post-actions feature knows how to render. Pinned
 * ids — every per-entry add/remove select and the global enable list draw from
 * the same vocabulary. `copylink` is the floor: the Copy-link action is always
 * offered.
 */
export const SHARE_TARGET_OPTIONS = [
  { label: 'X', value: 'x' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'Hacker News', value: 'hackernews' },
  { label: 'Email', value: 'email' },
  { label: 'Copy link', value: 'copylink' },
] as const

/** The bare `value` ids of {@link SHARE_TARGET_OPTIONS}, in pinned order. */
export const SHARE_TARGET_IDS = SHARE_TARGET_OPTIONS.map(
  (option) => option.value,
)

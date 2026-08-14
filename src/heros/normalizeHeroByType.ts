import type { FieldHook } from 'payload'

/**
 * Strip hero content the selected type doesn't render, so it can't linger
 * hidden in the admin and resurface later. The Media control shows only for
 * `standard` and the content fields hide under `blank`, so a type switch (or
 * seeded data) could otherwise leave an image or rich text the page never
 * displays — which then duplicates the body copy or hijacks the OG card the
 * moment the type changes. This keeps the stored hero consistent with what the
 * type actually renders (mirrors the field-visibility conditions in the hero
 * config and `HeroView`):
 *
 * - `media` renders only for `standard`.
 * - `richText` / `links` render for `none` / `standard` / `shader`, never `blank`.
 *
 * Pure and non-mutating; the field hook below applies it on every save.
 *
 * @see #58 — About carried a seeded headshot in `hero.media` and a duplicate
 *   `hero.richText` under a Blank hero, both invisible in the admin.
 */
export function normalizeHeroByType<
  T extends
    | { links?: unknown; media?: unknown; richText?: unknown; type?: unknown }
    | null
    | undefined,
>(hero: T): T {
  if (!hero || typeof hero !== 'object') {
    return hero
  }
  const next = { ...hero }
  if (next.type !== 'standard') {
    next.media = null
  }
  if (next.type === 'blank') {
    next.richText = null
    next.links = []
  }
  return next
}

/**
 * Field `beforeChange` hook for the hero group — normalizes the stored value to
 * match its `type` on every create/update (including drafts and autosave).
 */
export const normalizeHeroHook: FieldHook = ({ value }) =>
  normalizeHeroByType(value)

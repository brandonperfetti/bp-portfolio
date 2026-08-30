import type { CheckboxField, TextField } from 'payload'

import { enforceSlugFreeze } from './enforceSlugFreeze'
import { formatSlugHook } from './formatSlug'

type Overrides = {
  slugOverrides?: Partial<TextField>
  checkboxOverrides?: Partial<CheckboxField>
}

type Slug = (
  fieldToUse?: string,
  overrides?: Overrides,
) => [TextField, CheckboxField]

/**
 * Slug field pair: the slug text input plus a `slugLock` checkbox.
 *
 * @param fieldToUse - Source field the slug derives from while locked.
 *
 * @remarks `slugLock: true` means **"I do not hand-edit this slug"**, and that
 * resolves differently either side of first publish (#120):
 *
 * - **Before a document is published** it is derived from `fieldToUse` — the
 *   convenient drafting behaviour, safe because no public URL exists yet.
 * - **Once the document is published** it is frozen at the published value.
 *   A title edit can no longer move the URL; only an explicit unlock
 *   (`slugLock: false`) can, and that rename creates a redirect from the old
 *   path (`src/hooks/createSlugRedirect.ts`).
 *
 * Both halves are server-enforced by {@link enforceSlugFreeze}; the admin
 * component is a convenience that mirrors the same rule, never the gate. This
 * narrowing is why migrated v3 slugs — all stored `slugLock: true` — are frozen
 * without a data migration.
 */
export const slugField: Slug = (fieldToUse = 'title', overrides = {}) => {
  const { slugOverrides, checkboxOverrides } = overrides

  const checkBoxField: CheckboxField = {
    name: 'slugLock',
    type: 'checkbox',
    defaultValue: true,
    admin: {
      hidden: true,
      position: 'sidebar',
    },
    ...checkboxOverrides,
  }

  // @ts-expect-error - ts mismatch Partial<TextField> with TextField
  const slugFieldConfig: TextField = {
    name: 'slug',
    type: 'text',
    index: true,
    label: 'Slug',
    ...(slugOverrides || {}),
    hooks: {
      // Order matters: `formatSlugHook` normalises/derives the incoming value,
      // then `enforceSlugFreeze` has the last word and reverts it when the
      // document already serves a published URL under a lock (#120).
      beforeValidate: [formatSlugHook(fieldToUse), enforceSlugFreeze()],
    },
    admin: {
      position: 'sidebar',
      // Mirrored into the schema on purpose: an agent driving `/api/mcp` never
      // reads docs/PAYLOAD.md, so the load-bearing guardrail has to travel with
      // the tool schema (docs/PAYLOAD.md §"Connector-only agents"). Worded to
      // stay true on all six collections that use this field — only Posts and
      // Pages have a publish step and a public URL to freeze.
      description:
        'slugLock true means this slug is not hand-edited: it follows the title until first publish, then freezes. Freezing applies to Posts and Pages, whose slugs are public URLs. To rename a published one, send slugLock false with the new slug in the same write — the old path then redirects automatically.',
      ...(slugOverrides?.admin || {}),
      components: {
        Field: {
          path: '@/fields/slug/SlugComponent#SlugComponent',
          clientProps: {
            fieldToUse,
            checkboxFieldPath: checkBoxField.name,
          },
        },
      },
    },
  }

  return [slugFieldConfig, checkBoxField]
}

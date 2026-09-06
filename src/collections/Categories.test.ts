// @vitest-environment node
import type { Field } from 'payload'

import { describe, expect, it } from 'vitest'

import { Categories } from '@/collections/Categories'
import { Posts } from '@/collections/Posts'

/**
 * Config-shape pins for the Categories → Topics admin relabel (#149).
 *
 * @remarks **Why this asserts the config objects rather than booting Payload.**
 * `labels` and a field `label` are pure presentation: Payload reads them when
 * it renders the admin nav, the collection list header and the field's caption,
 * and they touch neither the database nor `payload-types.ts`. So the exported
 * `CollectionConfig` IS the artefact under test — there is nothing a booted
 * instance would tell us that the object does not, and no database, no
 * `@payload-config` and no admin bundle are needed to read it.
 *
 * The paired half of each assertion is the one that actually earns the test:
 * every label pin sits next to a pin on the **slug / field name staying
 * `categories`**. The whole point of #149 is that the rename stops at the
 * label — a future "let's finish the job" edit that renames the collection
 * would take a table migration, a search reindex and every agent's
 * `categories` MCP tool with it. These tests are the tripwire on that.
 */

/** Walk tabs/groups/rows to find a named field anywhere in the tree. */
const findFieldDeep = (fields: Field[], name: string): Field | undefined => {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field
    if ('fields' in field && Array.isArray(field.fields)) {
      const nested = findFieldDeep(field.fields, name)
      if (nested) return nested
    }
    if ('tabs' in field && Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        const nested = findFieldDeep(tab.fields, name)
        if (nested) return nested
      }
    }
  }
  return undefined
}

describe('Categories collection labels (#149)', () => {
  it('reads as Topic/Topics in the admin', () => {
    expect(Categories.labels).toEqual({
      singular: 'Topic',
      plural: 'Topics',
    })
  })

  it('keeps the `categories` slug', () => {
    // The relabel is presentation only. Changing this slug is a table rename,
    // a search reindex and a breaking MCP tool rename — see docs/PAYLOAD.md.
    expect(Categories.slug).toBe('categories')
  })
})

describe('Posts categories field label (#149)', () => {
  const field = findFieldDeep(Posts.fields, 'categories')

  it('is a relationship to `categories` under its original field name', () => {
    // Pins the read path (`post.categories`) that every consumer and the
    // generated types depend on, so the label assertions below cannot be
    // "satisfied" by a rename.
    expect(field).toBeDefined()
    expect(field).toMatchObject({
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    })
  })

  it('is labelled Topics for the editor', () => {
    expect(field).toMatchObject({ label: 'Topics' })
  })

  it('carries no admin description, which would reach payload-types.ts', () => {
    // Not a style preference — a pin on the zero-type-change property of #149.
    // Payload's type generator emits `admin.description` as a TSDoc comment on
    // the generated `Post['categories']`, so adding a caption here silently
    // dirties a generated, CI-gated file. If a description is ever wanted,
    // regenerate types in the SAME change rather than deleting this test.
    // Read through a cast: Payload types a relationship field's `admin` as
    // `Omit<FieldAdmin, 'description'>`, so the property is not addressable on
    // the union — which is itself half the point. The generator emits it
    // anyway if it is present at runtime, so assert on the runtime object.
    const admin = (field as { admin?: { description?: unknown } } | undefined)
      ?.admin
    expect(admin?.description).toBeUndefined()
  })
})

/**
 * #151 — a topic may point at the Page that is its home.
 *
 * Config-shape pins for the same reason the label pins above are: the field's
 * presence, cardinality and target are what the migration, `payload-types.ts`
 * and `getTopicSectionPaths` all agree on. The *behaviour* (which chip links
 * where, and the fallback when the home is unpublished) is covered where it
 * lives — `articlesRepo.test.ts` and `ArticleMeta.test.tsx`.
 */
describe('Categories sectionPage (#151)', () => {
  const field = findFieldDeep(Categories.fields, 'sectionPage')

  it('is a single, optional relationship to pages', () => {
    expect(field).toMatchObject({
      name: 'sectionPage',
      type: 'relationship',
      relationTo: 'pages',
      hasMany: false,
    })
    // Opt-in: a topic without a home stays a pure filter (#136 Direction
    // extended, item 5). `required` here would force a landing page on every
    // topic that does not need one.
    expect((field as { required?: boolean }).required).toBeFalsy()
  })

  it('sits in the sidebar with a description saying what it changes', () => {
    const admin = (
      field as { admin?: { position?: string; description?: string } }
    ).admin
    expect(admin?.position).toBe('sidebar')
    expect(admin?.description).toMatch(/optional/i)
    expect(admin?.description).toMatch(/\/articles/)
  })

  it('keeps the slug and title fields it already had', () => {
    // The new relationship is additive: a migration that dropped either of
    // these would take every topic chip and every `?topic=` link with it.
    expect(findFieldDeep(Categories.fields, 'title')).toBeDefined()
    expect(findFieldDeep(Categories.fields, 'slug')).toBeDefined()
  })
})

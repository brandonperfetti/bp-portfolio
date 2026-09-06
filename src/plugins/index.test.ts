// @vitest-environment node
import type { Config, Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { plugins } from '@/plugins'

/**
 * Config-shape pins for the redirects plugin's permanence field (#130).
 *
 * @remarks **Why this asserts the BUILT field rather than the options object.**
 * `redirectsPlugin(pluginConfig)` returns a closure; the `redirectTypes` and
 * `redirectTypeFieldOverride` values are captured inside it and are not
 * readable from the exported `plugins` array. Reading them back would mean
 * source-scanning `src/plugins/index.ts` for two literals — a test that passes
 * whenever the literals are present and says nothing about whether the plugin
 * did anything with them.
 *
 * So the plugin is applied to a bare config instead and the resulting
 * `redirects` collection is inspected. That is the field an editor actually
 * sees, and it is the only place the two settings become observable:
 *
 * - the field EXISTS at all only when `redirectTypes` is set — the plugin
 *   appends it via `...pluginConfig?.redirectTypes ? [redirectSelectField] : []`
 *   (`plugin-redirects/dist/index.js`), so its presence is the pin on that
 *   option, and dropping the option makes every redirect serve a 308 again;
 * - its `options` are `redirectOptions.filter(o => redirectTypes.includes(o.value))`,
 *   so the option values ARE the configured codes;
 * - `defaultValue` can only have come from `redirectTypeFieldOverride`, because
 *   the plugin builds this field `required: true` with no default of its own.
 *
 * No Payload boot: `plugin(config)` is a plain function call over a stub, no
 * database, no `@payload-config`, no admin bundle.
 */

/** The two codes this repo offers. Permanent first — it is the default. */
const EXPECTED_REDIRECT_TYPES = ['301', '302']

/** Apply every plugin to a bare config and collect the `redirects` collections. */
const buildRedirectsCollections = async () => {
  const found = []
  for (const plugin of plugins) {
    const applied = await (
      plugin as (config: Config) => Config | Promise<Config>
    )({ collections: [] } as unknown as Config)
    for (const collection of applied.collections ?? []) {
      if (collection.slug === 'redirects') found.push(collection)
    }
  }
  return found
}

const findField = (fields: Field[], name: string) =>
  fields.find((field) => 'name' in field && field.name === name)

describe('redirects plugin permanence field (#130)', () => {
  it('is contributed by exactly one plugin', async () => {
    // A second contributor would mean two `redirects` collections racing for
    // the same slug, and whichever this test happened to read would be a coin
    // flip. Pinned so the assertions below are about a single known field.
    expect(await buildRedirectsCollections()).toHaveLength(1)
  })

  it('exists, which is what proves redirectTypes is configured', async () => {
    const [redirects] = await buildRedirectsCollections()

    const type = findField(redirects.fields, 'type')
    expect(type).toBeDefined()
    expect(type?.type).toBe('select')
  })

  it('offers exactly 301 and 302', async () => {
    const [redirects] = await buildRedirectsCollections()
    const type = findField(redirects.fields, 'type') as SelectField

    expect(
      type.options.map((option) =>
        typeof option === 'string' ? option : option.value,
      ),
    ).toEqual(EXPECTED_REDIRECT_TYPES)
  })

  it('defaults to 301, the permanent code', async () => {
    // The behaviour this pins: the plugin builds the field `required: true`
    // with NO default, which would invalidate every existing row on its next
    // save and force a pick on every new one. `redirectTypeFieldOverride`
    // supplies the default, and permanent is the right one — it is what the
    // rename rows `createPathRedirect` writes need and the safe answer for a
    // hand-written row.
    const [redirects] = await buildRedirectsCollections()
    const type = findField(redirects.fields, 'type') as SelectField

    expect(type.required).toBe(true)
    expect(type.defaultValue).toBe('301')
  })

  it('keeps that default among the offered options', async () => {
    // Trivially true today and worth stating: a default that is not selectable
    // is a form that cannot be saved, and it is exactly what narrowing
    // `redirectTypes` without touching the override would produce.
    const [redirects] = await buildRedirectsCollections()
    const type = findField(redirects.fields, 'type') as SelectField

    const values = type.options.map((option) =>
      typeof option === 'string' ? option : option.value,
    )
    expect(values).toContain(type.defaultValue)
  })
})

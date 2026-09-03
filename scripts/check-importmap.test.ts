// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  CONFIG_SOURCE_DIR,
  IMPORT_MAP_DOC_REFERENCE,
  IMPORT_MAP_PATH,
  MINIMUM_IMPORT_MAP_ENTRIES,
  REGENERATE_COMMAND,
  checkImportMap,
  formatResult,
  listConfigSources,
  parseDeclaredComponents,
  parseImportMapKeys,
} from './check-importmap.mjs'

/**
 * Unit tests for the #131 importMap non-emptiness gate.
 *
 * @remarks The fixtures are importMap *strings* written in the shape Payload's
 * generator really emits — `import { X as X_<hash> } from '…'` lines above an
 * `export const importMap = { '<module>#<Export>': X_<hash>, … }` literal. A
 * gate that is a text matcher is only as good as the fidelity of its fixtures,
 * so the last block also runs the gate against the committed map and the real
 * `src/` tree.
 *
 * The empty fixture is the point of the whole file: it is what
 * `pnpm generate:importmap` writes when component resolution fails, exit code 0
 * and all, and it is what the #116 staleness gate cannot see.
 */

/** A component the config declares, as it appears in both places. */
const SLUG_COMPONENT = '@/fields/slug/SlugComponent#SlugComponent'
const ROW_LABEL_COMPONENT = '@/blocks/Column/RowLabel#ColumnRowLabel'

/** Build a map fixture with `count` synthetic vendor entries plus `extra`. */
const importMapFixture = (count: number, extra: string[] = []) => {
  const vendor = Array.from(
    { length: count },
    (_, i) => `@payloadcms/richtext-lexical/client#Feature${i}`,
  )
  const keys = [...vendor, ...extra]
  return [
    ...keys.map(
      (key, i) => `import { X as X_${i} } from '${key.split('#')[0]}'`,
    ),
    '',
    'export const importMap = {',
    ...keys.map((key, i) => `  '${key}': X_${i},`),
    '}',
  ].join('\n')
}

/**
 * What the generator writes when resolution fails — the #131 failure mode
 * verbatim: a syntactically valid module, zero entries, exit 0.
 */
const EMPTY_IMPORT_MAP = `export const importMap = {}\n`

/** A config source that declares one component. */
const configDeclaring = (component: string) =>
  `export const slugField = () => ({
  admin: { components: { Field: { path: '${component}' } } },
})`

describe('parseImportMapKeys', () => {
  it('reads the keys of the generated object literal', () => {
    expect(parseImportMapKeys(importMapFixture(2, [SLUG_COMPONENT]))).toEqual([
      '@payloadcms/richtext-lexical/client#Feature0',
      '@payloadcms/richtext-lexical/client#Feature1',
      SLUG_COMPONENT,
    ])
  })

  it('reads nothing from an empty map', () => {
    expect(parseImportMapKeys(EMPTY_IMPORT_MAP)).toEqual([])
  })

  it('does not count the import statements above the literal', () => {
    // The specifiers appear twice in the real file, in two syntaxes. Counting
    // the `import` lines would let a file with 31 imports and an empty map
    // sail through — the exact shape the generator produces on failure is a
    // full import list with nothing in the map only if it half-fails, so this
    // has to be pinned rather than assumed.
    const halfFailed = `${importMapFixture(30)
      .split('export const importMap')[0]
      .trimEnd()}\n\nexport const importMap = {}\n`

    expect(parseImportMapKeys(halfFailed)).toEqual([])
  })

  it('reads nothing from a file with no map literal at all', () => {
    expect(parseImportMapKeys('// nothing here\n')).toEqual([])
  })
})

describe('parseDeclaredComponents', () => {
  it('finds an alias-rooted component path', () => {
    expect(parseDeclaredComponents(configDeclaring(SLUG_COMPONENT))).toEqual([
      SLUG_COMPONENT,
    ])
  })

  it('deduplicates a path declared twice', () => {
    const source = `${configDeclaring(SLUG_COMPONENT)}\n${configDeclaring(SLUG_COMPONENT)}`

    expect(parseDeclaredComponents(source)).toEqual([SLUG_COMPONENT])
  })

  it('ignores a plain module import, which has no export fragment', () => {
    expect(
      parseDeclaredComponents(`import { slugField } from '@/fields/slug'`),
    ).toEqual([])
  })

  it('ignores a bare package specifier', () => {
    expect(
      parseDeclaredComponents(`const x = '@payloadcms/ui#Button'`),
    ).toEqual([])
  })
})

describe('checkImportMap', () => {
  const files = ['src/fields/slug/index.ts', 'src/blocks/Column/config.ts']
  const read = (file: string) =>
    file.includes('slug')
      ? configDeclaring(SLUG_COMPONENT)
      : configDeclaring(ROW_LABEL_COMPONENT)

  it('passes a healthy map', () => {
    const result = checkImportMap(
      importMapFixture(29, [SLUG_COMPONENT, ROW_LABEL_COMPONENT]),
      files,
      read,
    )

    expect(result.entryCount).toBe(31)
    expect(result.missing).toEqual([])
    expect(formatResult(result).ok).toBe(true)
  })

  it('FAILS on the empty map the generator can emit with exit 0 (#131)', () => {
    const result = checkImportMap(EMPTY_IMPORT_MAP, files, read)
    const { lines, ok } = formatResult(result)

    expect(result.entryCount).toBe(0)
    expect(ok).toBe(false)
    // Both failure modes fire at once here, which is the honest report: the
    // map is short AND both components are gone.
    expect(result.missing.map((m) => m.component)).toEqual([
      SLUG_COMPONENT,
      ROW_LABEL_COMPONENT,
    ])
    expect(lines[0]).toContain(
      `below the floor of ${MINIMUM_IMPORT_MAP_ENTRIES}`,
    )
    expect(lines.join('\n')).toContain(REGENERATE_COMMAND)
    expect(lines.join('\n')).toContain(IMPORT_MAP_DOC_REFERENCE)
  })

  it('FAILS when the map is full but one declared component did not resolve', () => {
    // The partial failure the entry floor alone would miss: 31 entries, every
    // lexical feature present, and the slug field renders blank in the admin.
    const result = checkImportMap(
      importMapFixture(30, [ROW_LABEL_COMPONENT]),
      files,
      read,
    )
    const { lines, ok } = formatResult(result)

    expect(result.entryCount).toBe(31)
    expect(ok).toBe(false)
    expect(result.missing).toEqual([
      { component: SLUG_COMPONENT, file: 'src/fields/slug/index.ts' },
    ])
    expect(lines[0]).toContain('src/fields/slug/index.ts')
  })

  it('FAILS when the vendor entries vanish but the local ones survive', () => {
    // The mirror case, which the declared-components check alone would miss:
    // both repo components resolve, every rich-text field is broken.
    const result = checkImportMap(
      importMapFixture(0, [SLUG_COMPONENT, ROW_LABEL_COMPONENT]),
      files,
      read,
    )
    const { lines, ok } = formatResult(result)

    expect(result.missing).toEqual([])
    expect(ok).toBe(false)
    expect(lines[0]).toContain('2 entries')
  })

  it('reports a component once even when two files declare it', () => {
    const result = checkImportMap(importMapFixture(30), files, () =>
      configDeclaring(SLUG_COMPONENT),
    )

    expect(result.missing).toHaveLength(1)
    expect(result.declared).toEqual([SLUG_COMPONENT])
  })
})

describe('formatResult', () => {
  it('reports the counts on success', () => {
    const { lines, ok } = formatResult({
      declared: [SLUG_COMPONENT],
      entryCount: 31,
      missing: [],
    })

    expect(ok).toBe(true)
    expect(lines).toEqual([
      `importMap gate: 31 entries (floor ${MINIMUM_IMPORT_MAP_ENTRIES}), all 1 declared component(s) present.`,
    ])
  })

  it('emits GitHub error annotations on failure', () => {
    const { lines } = formatResult({
      declared: [SLUG_COMPONENT],
      entryCount: 0,
      missing: [
        { component: SLUG_COMPONENT, file: 'src/fields/slug/index.ts' },
      ],
    })

    expect(lines.every((line) => line.startsWith('::error'))).toBe(true)
  })
})

/**
 * The gate against the real tree.
 *
 * @remarks Fixtures prove the matcher; this proves the matcher is pointed at
 * the right shape. If Payload's generator ever changes how it writes the map,
 * this is the test that fails.
 */
describe('the committed importMap', () => {
  it('passes the gate', () => {
    const result = checkImportMap(
      readFileSync(IMPORT_MAP_PATH, 'utf8'),
      listConfigSources(CONFIG_SOURCE_DIR),
    )

    expect(result.missing).toEqual([])
    expect(result.entryCount).toBeGreaterThanOrEqual(MINIMUM_IMPORT_MAP_ENTRIES)
    expect(formatResult(result).ok).toBe(true)
  })

  it('actually finds this repo’s declared components, so the check is not vacuous', () => {
    // A scan that silently matched nothing would pass forever. The two paths
    // below are declared in `src/fields/slug/index.ts` and
    // `src/blocks/Column/config.ts`.
    const result = checkImportMap(
      readFileSync(IMPORT_MAP_PATH, 'utf8'),
      listConfigSources(CONFIG_SOURCE_DIR),
    )

    expect(result.declared).toContain(SLUG_COMPONENT)
    expect(result.declared).toContain(ROW_LABEL_COMPONENT)
  })
})

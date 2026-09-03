#!/usr/bin/env node
/**
 * Non-emptiness gate for the generated admin importMap (#131).
 *
 * `pnpm generate:importmap` can write an importMap with **zero** entries and
 * still exit 0. When that happens the admin editor loses every custom field
 * component at once — across all collections, because they all resolve through
 * this one map — and CI does not notice: the #116 staleness gate regenerates
 * the file and diffs it, so an empty map regenerated as empty is "not stale"
 * and passes. The only thing standing between that and production is a human
 * spotting 90 deleted lines in a review of a generated file.
 *
 * This gate closes it by asking a question staleness cannot: is the committed
 * map still *plausible*? It runs in CI immediately after the regenerate and
 * before the diff, so it fails on the freshly generated content — the thing
 * that would actually be deployed — rather than on whatever happens to be
 * committed.
 *
 * ## Two independent checks, because there are two ways to be empty
 *
 * The observed failure mode blanks the whole map, but a partial resolution
 * failure is just as damaging and much easier to miss, so the gate asks
 * separately about the repo's own components and about the total.
 *
 * 1. **Every component this repo declares must be in the map.** Payload
 *    references a custom component by an import-path string —
 *    `'@/fields/slug/SlugComponent#SlugComponent'` — written in the collection
 *    or field config, and the generator's whole job is to turn each of those
 *    into a map key. So the expected keys are *derived from the config
 *    sources*, not frozen in a list here: adding a component in the usual
 *    spelling adds an obligation with no second place to remember to edit,
 *    and removing one removes it. A frozen list would rot into either a
 *    permanent false failure or a check that stopped covering the newest
 *    components — the two ways this kind of gate normally dies.
 *
 *    **What the scan can and cannot see.** It is a regex over source text, and
 *    it matches exactly one shape: a **single-quoted** string literal starting
 *    `@/` and containing `#`. That is how every component in this repo is
 *    declared today, and it is the spelling `check 1` is worth having. It is
 *    not a parser, so it misses a path spelled any other way — double quotes,
 *    a template literal, a constant assembled at runtime, an alias other than
 *    `@/`, a path built by string concatenation. Each of those silently drops
 *    an obligation, which is an under-count, which is the dangerous direction.
 *    Check 2 is the backstop for exactly that: whatever the scan fails to
 *    notice, the entry floor still refuses a map that came back short. Neither
 *    check is complete on its own and this one is not safe by construction —
 *    they are two coarse questions whose failure modes do not overlap.
 * 2. **The map must carry at least {@link MINIMUM_IMPORT_MAP_ENTRIES}
 *    entries.** Most of the map is not this repo's code at all — it is
 *    `@payloadcms/richtext-lexical`'s client and RSC entries, which check 1
 *    cannot see because nothing in `src/` names them. A resolution failure
 *    confined to `node_modules` would leave the two local keys present and
 *    still break every rich-text field, so the total is checked too.
 *
 * ## Why both errors point at regeneration rather than at the file
 *
 * The map is generated, so the fix is never "edit the map". The messages say
 * to re-run the generator and, if it still comes back short, to treat that as
 * the container-resolution bug #131 is about — which is the diagnosis this
 * gate is meant to surface rather than paper over.
 *
 * ## Scope
 *
 * Test and Storybook sources are excluded from the declaration scan: a
 * component path written in a fixture is not a component the config declares,
 * and requiring it would make the gate fail over a test's string literal. A
 * path inside a comment IS counted, deliberately — over-counting an obligation
 * fails red and a human clears it in a minute, while under-counting one lets an
 * unresolved component through, which is the outcome the gate exists to
 * prevent. Same asymmetry, and the same reasoning, as
 * `scripts/check-migrations-rls.mjs`.
 *
 * That asymmetry governs where a false result can land, not whether one can:
 * the shapes listed under check 1 above are under-counts the scan cannot see
 * at all, and no amount of leniency elsewhere finds them. The entry floor is
 * what keeps those from being silent.
 *
 * @module
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The generated file this gate inspects. */
export const IMPORT_MAP_PATH = 'src/app/(payload)/admin/importMap.js'

/** Root of the sources that may declare an admin component. */
export const CONFIG_SOURCE_DIR = 'src'

/**
 * Floor on total importMap entries.
 *
 * @remarks Measured at 31 on `7f35583` (2026-09-02): 2 declared by this repo,
 * the rest `@payloadcms/richtext-lexical` client and RSC entries. The floor
 * sits below that with headroom so deliberately dropping a lexical feature does
 * not trip a gate that is not about feature count — while still being far above
 * the failure this exists to catch, which produces 0. Raise it if the real
 * count ever drops near it; do not lower it to make a short map pass.
 */
export const MINIMUM_IMPORT_MAP_ENTRIES = 25

/** Doc the failure messages point a reader at. */
export const IMPORT_MAP_DOC_REFERENCE = 'docs/PAYLOAD.md'

/** Command that rebuilds the map. */
export const REGENERATE_COMMAND = 'pnpm generate:importmap'

/** Sources that may mention a component path without declaring one. */
const EXCLUDED_SOURCE = /\.(test|spec|stories)\.tsx?$/

/**
 * A Payload component reference: an alias-rooted module path, `#`, an export
 * name. Anchored on the quote so a bare mention in prose cannot match.
 */
const COMPONENT_PATH_RE = /'(@\/[^'#]+#[A-Za-z_$][\w$]*)'/g

/** A key line inside the generated `importMap` object literal. */
const MAP_KEY_RE = /^\s*'([^']+)':/gm

/** Where the generated object literal starts. */
const MAP_START = 'export const importMap = {'

/**
 * The keys of the generated `importMap` object.
 *
 * @param source - Contents of the generated file.
 * @returns Map keys in file order. Empty when the file has no map literal at
 * all, which is itself one of the shapes this gate must fail on.
 *
 * @remarks Only the object literal is scanned, not the whole file. The `import`
 * statements above it carry the same module specifiers in a different syntax,
 * and counting those would let a file with 31 imports and an empty map pass.
 */
export function parseImportMapKeys(source) {
  const start = source.indexOf(MAP_START)
  if (start === -1) return []
  const body = source.slice(start + MAP_START.length)
  const keys = []
  MAP_KEY_RE.lastIndex = 0
  for (const match of body.matchAll(MAP_KEY_RE)) keys.push(match[1])
  return keys
}

/**
 * Component paths declared in a config source.
 *
 * @param source - TypeScript source text.
 * @returns The `@/module#Export` strings it contains, deduplicated.
 */
export function parseDeclaredComponents(source) {
  const found = []
  COMPONENT_PATH_RE.lastIndex = 0
  for (const match of source.matchAll(COMPONENT_PATH_RE)) {
    if (!found.includes(match[1])) found.push(match[1])
  }
  return found
}

/**
 * Config sources that may declare an admin component.
 *
 * @param dir - Directory to walk; defaults to {@link CONFIG_SOURCE_DIR}.
 * @returns Full paths to every non-test `.ts`/`.tsx` file beneath it.
 */
export function listConfigSources(dir = CONFIG_SOURCE_DIR) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /\.tsx?$/.test(entry.name))
    .filter((entry) => !EXCLUDED_SOURCE.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
}

/**
 * Run the gate over one importMap and a set of config sources.
 *
 * @param importMapSource - Contents of the generated file.
 * @param files - Config source paths.
 * @param readFile - Reader, injectable so tests need no fixtures on disk.
 * @returns `{ entryCount, declared, missing }` — `missing` is one entry per
 * declared component that the map does not carry, with the file that declared
 * it, in first-seen order.
 */
export function checkImportMap(
  importMapSource,
  files,
  readFile = (file) => readFileSync(file, 'utf8'),
) {
  const keys = new Set(parseImportMapKeys(importMapSource))
  const declared = []
  const missing = []
  for (const file of files) {
    for (const component of parseDeclaredComponents(readFile(file))) {
      if (!declared.includes(component)) declared.push(component)
      if (
        !keys.has(component) &&
        !missing.some((m) => m.component === component)
      ) {
        missing.push({ component, file })
      }
    }
  }
  return { declared, entryCount: keys.size, missing }
}

/**
 * Render the workflow-command lines for a completed run.
 *
 * @param result - The value {@link checkImportMap} returned.
 * @returns `{ ok, lines }` — `ok` is the process verdict, `lines` are the lines
 * to print (GitHub `::error::` annotations on failure).
 *
 * @remarks The verdict is tracked explicitly rather than inferred from
 * `lines.length`, for the same reason `check-migrations-rls.mjs` does: a
 * success also prints a line, and either failure mode can fire with the other
 * silent.
 */
export function formatResult(result) {
  const lines = []
  let ok = true

  if (result.entryCount < MINIMUM_IMPORT_MAP_ENTRIES) {
    ok = false
    lines.push(
      `::error file=${IMPORT_MAP_PATH}::Generated importMap has ${result.entryCount} entries, below the floor of ${MINIMUM_IMPORT_MAP_ENTRIES}. An importMap that generates short or empty blanks the admin editor for every collection at once, and the staleness gate cannot see it (empty regenerated as empty is not stale). Re-run \`${REGENERATE_COMMAND}\`; if it still comes back short, this is the component-resolution failure tracked in #131 — do not commit the result. See ${IMPORT_MAP_DOC_REFERENCE}.`,
    )
  }

  for (const { component, file } of result.missing) {
    ok = false
    lines.push(
      `::error file=${file}::Component "${component}" is declared here but absent from the generated importMap. Re-run \`${REGENERATE_COMMAND}\`; if the entry does not appear, the generator failed to resolve it and the admin field using it will render blank (#131). See ${IMPORT_MAP_DOC_REFERENCE}.`,
    )
  }

  if (ok) {
    lines.push(
      `importMap gate: ${result.entryCount} entries (floor ${MINIMUM_IMPORT_MAP_ENTRIES}), all ${result.declared.length} declared component(s) present.`,
    )
  }

  return { ok, lines }
}

/**
 * CLI entry point.
 *
 * @param importMapPath - The generated file; defaults to
 * {@link IMPORT_MAP_PATH}. `node scripts/check-importmap.mjs <map> <srcDir>`
 * overrides both (used by the red/green proof against a fixture).
 * @param sourceDir - Config source root; defaults to
 * {@link CONFIG_SOURCE_DIR}.
 * @returns The process exit code: 0 when the map is plausible.
 */
export function main(
  importMapPath = process.argv[2] ?? IMPORT_MAP_PATH,
  sourceDir = process.argv[3] ?? CONFIG_SOURCE_DIR,
) {
  const { ok, lines } = formatResult(
    checkImportMap(
      readFileSync(importMapPath, 'utf8'),
      listConfigSources(sourceDir),
    ),
  )
  for (const line of lines) console.log(line)
  return ok ? 0 : 1
}

// `import.meta.main` is not available on the Node 24 CI runner; compare the
// resolved entry URL instead so importing this module from the tests is inert.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}

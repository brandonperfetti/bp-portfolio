#!/usr/bin/env node
/**
 * RLS-enforcement gate for new-table migrations (#117).
 *
 * `docs/PAYLOAD.md` §"New-table RLS convention (#72)" requires that a
 * migration creating a table also enable Row Level Security on it **in the
 * same migration**, including the paired `_v` (versions) and `_rels` (join)
 * tables Payload generates. The #116 gate in CI's `quality` job enforces that
 * a Payload schema change *has* a migration; it says nothing about that
 * migration's contents, so a new table could ship RLS-less and CI would stay
 * green. This closes that gap: it reads the committed migration sources and
 * fails when a `CREATE TABLE "x"` has no `ALTER TABLE "x" ENABLE ROW LEVEL
 * SECURITY` in the same file.
 *
 * It deliberately does **not** re-implement #116 (migration existence), and it
 * checks only that RLS is *enabled*, never the policy content — the #72
 * lockdown is default-deny with no policies by design.
 *
 * ## Why companions need no special case
 *
 * Payload emits `_pages_v`, `pages_rels`, `_pages_v_blocks_cta`, … as their
 * own `CREATE TABLE` statements in the same migration as their parent. Under a
 * per-table-name rule each one is therefore already an independent obligation
 * — measured on this corpus, 191 distinct tables from 191 `CREATE TABLE`
 * statements, companions included. No `_v`/`_rels` name-derivation is needed,
 * and none is done: deriving names would be strictly weaker than reading the
 * statements Payload actually wrote.
 *
 * ## The grandfathering decision (#117 AC 3)
 *
 * Grandfathering **is** required, and the audit that decided it is worth
 * stating because the obvious reading of the corpus is wrong.
 *
 * `20260820_221032_rls_lockdown.ts` (the #72 backfill) enables RLS on every
 * table that existed then — but it does so with a `DO $$ … FOR r IN SELECT
 * tablename FROM pg_tables … EXECUTE format('ALTER TABLE public.%I ENABLE ROW
 * LEVEL SECURITY;', r.tablename)` loop. The table names never appear as
 * literal text, so **no** textual matcher can see that backfill. Measured on
 * the corpus at `de79b92`: 191 tables are created across the migrations; only
 * 2 (`cookie_consent`, `corvus_embeddings`, both post-lockdown) carry a
 * literal `ENABLE ROW LEVEL SECURITY`. Both a same-file rule and a
 * corpus-wide "enabled anywhere" rule therefore flag the same 189
 * already-protected tables — and 189 is exactly the count of
 * `rls_disabled_in_public` advisor errors the lockdown's own docblock records
 * as the board state it fixed, which is what confirms the loop covered them.
 *
 * So the grandfathered set is not a list of 189 table names; it is "everything
 * the #72 backfill already swept", and the migration timeline expresses that
 * exactly: every migration at or before {@link RLS_BACKFILL_MIGRATION} is
 * covered by the loop, every migration after it must carry its own explicit
 * `ENABLE`. Payload names migrations `YYYYMMDD_HHMMSS_slug`, so a plain
 * lexicographic compare on the basename is a chronological compare.
 *
 * That boundary has one way to be cheated — a migration filed with a
 * timestamp *earlier* than the cutoff would be silently grandfathered — so the
 * grandfathered set is also pinned by count ({@link
 * GRANDFATHERED_MIGRATION_COUNT}). Any new file landing at or before the
 * cutoff changes that count and is reported as an error rather than skipped.
 *
 * ## Scope
 *
 * Both halves of a migration are scanned, `up` and `down`, and each is
 * checked against ITSELF. A `down` that recreates a table it dropped needs
 * RLS on the recreated table for the same reason `up` does; no migration in
 * the corpus does this today, so the rule costs nothing and closes the case
 * before it appears.
 *
 * The same-direction requirement is the load-bearing half of that sentence.
 * Scanning the file as one blob let an `ENABLE ROW LEVEL SECURITY` in `down`
 * satisfy a `CREATE TABLE` in `up`. Deployment runs `up` only, so the gate
 * would report green while the deployed table had no RLS — the precise
 * failure this script was written to catch. See {@link
 * splitMigrationDirections}.
 *
 * Only executable text is scanned. A comment is not a statement, and reading
 * one as if it were fails in both directions: a commented-out `ENABLE ROW
 * LEVEL SECURITY` discharged a real `CREATE TABLE` (green gate, unprotected
 * table — the same class as the cross-direction hole above), and a
 * commented-out `CREATE TABLE` invented an obligation nothing could satisfy.
 * Both spellings are stripped before either parse. See {@link
 * checkMigrationSource} and `scripts/lib/sql-comments.mjs`.
 *
 * @module
 */

import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { stripComments } from './lib/sql-comments.mjs'

/** Directory holding the committed Payload migrations. */
export const MIGRATIONS_DIR = 'src/migrations'

/**
 * Basename (no extension) of the #72 RLS backfill migration.
 *
 * @remarks Migrations at or before this one are covered by that migration's
 * dynamic `pg_tables` loop and are not required to carry a literal
 * `ENABLE ROW LEVEL SECURITY` of their own. See the module docblock.
 */
export const RLS_BACKFILL_MIGRATION = '20260820_221032_rls_lockdown'

/**
 * How many migration files sit at or before {@link RLS_BACKFILL_MIGRATION}.
 *
 * @remarks Frozen at 36, measured at `de79b92`. This set can only shrink or
 * stay the same in honest history; a new migration always gets a *later*
 * timestamp. Pinning the count turns "a file appeared before the cutoff" —
 * the one way to slip an unchecked table past the boundary — into a loud
 * failure instead of a silent skip.
 */
export const GRANDFATHERED_MIGRATION_COUNT = 36

/** Doc the failure message points a reader at. */
export const RLS_DOC_REFERENCE = 'docs/PAYLOAD.md'

/**
 * Migration files that are not migrations.
 *
 * @remarks `index.ts` is Payload's generated barrel of migration imports.
 */
const NON_MIGRATION_FILES = new Set(['index.ts'])

/**
 * `CREATE TABLE [IF NOT EXISTS] ["schema".]"name"` — quoted or bare
 * identifier, optional schema qualifier.
 */
const CREATE_TABLE_RE =
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))/gi

/**
 * `ALTER TABLE [ONLY] ["schema".]"name" ENABLE ROW LEVEL SECURITY` — the same
 * identifier forms, allowing arbitrary whitespace (these statements are
 * written across lines inside `sql` template literals).
 */
const ENABLE_RLS_RE =
  /\bALTER\s+TABLE\s+(?:ONLY\s+)?(?:(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s*\.\s*)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi

/**
 * Collect every capture-1-or-2 identifier a global regex matches in `source`.
 *
 * @param pattern - A global regex whose groups 1 and 2 are the quoted and bare
 * spellings of a table identifier.
 * @param source - Migration source text.
 * @returns The identifiers, in first-seen order, deduplicated.
 */
function matchTableNames(pattern, source) {
  const names = []
  // `lastIndex` is shared state on a module-level global regex; reset it so
  // repeated calls (tests, or a second file) start from the top.
  pattern.lastIndex = 0
  for (const match of source.matchAll(pattern)) {
    const name = match[1] ?? match[2]
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Split a migration's source into its `up` and `down` bodies.
 *
 * @remarks Textual, which is sufficient here because the corpus is uniform:
 * every committed migration declares exactly one `export async function up`
 * and one `export async function down` (measured across all 39 at
 * `3d55362`). Text from a marker to the next marker — or to end-of-file for
 * the last one — is that direction's body; anything before the first marker
 * is imports and belongs to neither.
 *
 * A source with no marker at all is returned as a single `up` body rather
 * than skipped. Bare DDL with no function wrapper must still be checked;
 * treating it as unparseable would be a silent hole in the gate.
 *
 * @param source - Migration source text.
 * @returns One `{ direction, body }` per direction found, in file order.
 */
export function splitMigrationDirections(source) {
  const markers = []
  const pattern = /export\s+(?:async\s+)?function\s+(up|down)\b/g
  for (const match of source.matchAll(pattern)) {
    markers.push({ direction: match[1], index: match.index })
  }
  if (markers.length === 0) return [{ direction: 'up', body: source }]

  markers.sort((a, b) => a.index - b.index)
  return markers.map((marker, position) => ({
    direction: marker.direction,
    body: source.slice(
      marker.index,
      position + 1 < markers.length ? markers[position + 1].index : undefined,
    ),
  }))
}

/**
 * Tables a migration creates.
 *
 * @param source - Migration source text.
 * @returns Table identifiers, deduplicated, in first-seen order.
 */
export function parseCreatedTables(source) {
  return matchTableNames(CREATE_TABLE_RE, source)
}

/**
 * Tables a migration enables Row Level Security on.
 *
 * @param source - Migration source text.
 * @returns Table identifiers, deduplicated, in first-seen order.
 */
export function parseRlsEnabledTables(source) {
  return matchTableNames(ENABLE_RLS_RE, source)
}

/**
 * Whether a migration predates (or is) the #72 backfill and so inherits its
 * coverage.
 *
 * @param file - Migration filename, with or without directories.
 * @returns `true` when the migration is grandfathered.
 */
export function isGrandfathered(file) {
  return basename(file).replace(/\.ts$/, '') <= RLS_BACKFILL_MIGRATION
}

/**
 * Check one migration's source against the new-table RLS rule.
 *
 * @remarks Each direction is checked against ITSELF. Matching a whole file's
 * `CREATE TABLE`s against a whole file's `ENABLE ROW LEVEL SECURITY`s let an
 * `ENABLE` in `down` discharge a `CREATE` in `up` — and deployment runs `up`
 * only, so the gate could pass green while the deployed table shipped with no
 * RLS at all. That is the exact failure this gate exists to prevent, so the
 * two halves are now parsed and required independently: a table created in
 * `up` needs its `ENABLE` in `up`, and one recreated in `down` needs its own.
 *
 * A table missing RLS in both directions is reported once, not twice — the
 * failure is "this migration ships this table unprotected", and one
 * `::error::` per table per file is what the operator needs to act on.
 *
 * Comments are stripped ONCE here, before the split, and everything
 * downstream therefore sees executable text only. This is the single place
 * that happens: {@link parseCreatedTables} and {@link parseRlsEnabledTables}
 * stay honest raw matchers over whatever they are handed, which is what their
 * own unit tests exercise, so the stripping cannot be half-applied to one side
 * of the comparison and not the other.
 *
 * @param file - Path used in the reported message.
 * @param source - Migration source text.
 * @returns The tables created without an `ENABLE ROW LEVEL SECURITY` in the
 * SAME direction, deduplicated, in first-seen order. Empty for a
 * grandfathered migration.
 */
export function checkMigrationSource(file, source) {
  if (isGrandfathered(file)) return []
  const offenders = []
  for (const { body } of splitMigrationDirections(stripComments(source))) {
    const enabled = new Set(parseRlsEnabledTables(body))
    for (const table of parseCreatedTables(body)) {
      if (!enabled.has(table) && !offenders.includes(table)) {
        offenders.push(table)
      }
    }
  }
  return offenders
}

/**
 * Migration `.ts` files in a directory, sorted, excluding generated barrels.
 *
 * @param dir - Directory to read.
 * @returns Full paths, chronologically ordered (filenames are timestamped).
 */
export function listMigrationFiles(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && !NON_MIGRATION_FILES.has(name))
    .sort()
    .map((name) => join(dir, name))
}

/**
 * Run the gate over a set of migration files.
 *
 * @param files - Migration paths.
 * @param readFile - Reader, injectable so tests need no fixture files on disk.
 * @returns `{ failures, grandfathered, checked }` — `failures` is one entry
 * per offending `{ file, table }`, `grandfathered` and `checked` are counts.
 */
export function checkMigrations(
  files,
  readFile = (file) => readFileSync(file, 'utf8'),
) {
  const failures = []
  let grandfathered = 0
  let checked = 0
  for (const file of files) {
    if (isGrandfathered(file)) {
      grandfathered += 1
      continue
    }
    checked += 1
    for (const table of checkMigrationSource(file, readFile(file))) {
      failures.push({ file, table })
    }
  }
  return { failures, grandfathered, checked }
}

/**
 * Render the workflow-command lines for a completed run.
 *
 * @param result - The value {@link checkMigrations} returned.
 * @returns `{ ok, lines }` — `ok` is the process verdict, `lines` are the
 * lines to print (GitHub `::error::` annotations on failure).
 */
export function formatResult(result) {
  const lines = []
  // Two independent failure modes — a table missing RLS, and the
  // grandfathered set changing size. Track the verdict explicitly rather than
  // inferring it from `lines.length`: the count mismatch produces exactly one
  // line with zero table failures, which any line-counting verdict reads as a
  // pass. (It did, until proof case D caught it.)
  let ok = true

  if (result.grandfathered !== GRANDFATHERED_MIGRATION_COUNT) {
    ok = false
    lines.push(
      `::error::Expected ${GRANDFATHERED_MIGRATION_COUNT} migrations at or before the #72 RLS backfill (${RLS_BACKFILL_MIGRATION}), found ${result.grandfathered}. A migration must not be dated before that backfill — its tables would skip the RLS check. Rename it with a current timestamp, or update GRANDFATHERED_MIGRATION_COUNT in scripts/check-migrations-rls.mjs if a grandfathered migration was deliberately removed.`,
    )
  }

  for (const { file, table } of result.failures) {
    ok = false
    lines.push(
      `::error file=${file}::Migration creates table "${table}" without enabling Row Level Security. Add \`await db.execute(sql\`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;\`)\` to this migration — including every paired _v / _rels table Payload generated. See ${RLS_DOC_REFERENCE} ("New-table RLS convention (#72)").`,
    )
  }

  if (ok) {
    lines.push(
      `New-table RLS gate: ${result.checked} migration(s) checked, ${result.grandfathered} grandfathered at or before ${RLS_BACKFILL_MIGRATION}. No table is missing ENABLE ROW LEVEL SECURITY.`,
    )
  }

  return { ok, lines }
}

/**
 * CLI entry point.
 *
 * @param dir - Migrations directory; defaults to {@link MIGRATIONS_DIR}, and
 * `node scripts/check-migrations-rls.mjs <dir>` overrides it (used by the
 * red/green proof against a throwaway fixture corpus).
 * @returns The process exit code: 0 when every new table has RLS.
 */
export function main(dir = process.argv[2] ?? MIGRATIONS_DIR) {
  const { ok, lines } = formatResult(checkMigrations(listMigrationFiles(dir)))
  for (const line of lines) console.log(line)
  return ok ? 0 : 1
}

// `import.meta.main` is not available on the Node 24 CI runner; compare the
// resolved entry URL instead so importing this module from the tests is inert.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}

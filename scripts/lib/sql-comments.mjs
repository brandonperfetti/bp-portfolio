/**
 * Comment stripping for migration sources that carry SQL in template literals
 * (#123, CodeRabbit wave 2).
 *
 * `scripts/check-migrations-rls.mjs` decides whether a migration enables Row
 * Level Security by regex-scanning its source. Scanning raw text means a
 * COMMENT counts as a statement, and both directions of that are wrong:
 *
 * - A commented `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` discharges a real
 *   `CREATE TABLE "x"`. The gate reports green; the deployed table has no RLS.
 *   That is the exact failure the gate exists to catch, so this is the half
 *   that matters.
 * - A commented `CREATE TABLE "x"` invents an obligation nothing can satisfy,
 *   and the gate goes red on a table that is never created. Loud rather than
 *   dangerous, but still wrong, and fixed by the same pass.
 *
 * ## Two comment syntaxes, two passes
 *
 * A migration is TypeScript whose payload is SQL inside `sql` template
 * literals, so `// …` and `-- …` both appear and neither pass alone is enough.
 * Stripping runs in that order and only ever in the right context:
 *
 * 1. **TypeScript.** `//` and slash-star comments outside any literal. String
 *    and template literals are matched FIRST and returned untouched, which is
 *    what keeps the SQL payload intact — the whole point, since that is where
 *    the statements live.
 * 2. **SQL.** `--` and slash-star comments INSIDE each template literal only.
 *    Confining pass 2 to template literals is deliberate: a bare `--` in
 *    TypeScript is a decrement operator, and a global sweep would eat code.
 *
 * ## What it does not do
 *
 * Not a parser, and it does not need to be — the question it serves is "does
 * this DDL appear in something that will EXECUTE". Two known limits, neither
 * reachable from the committed corpus:
 *
 * - Dollar-quoted bodies (`DO $$ … $$`) are not treated as opaque strings, so
 *   a `--` inside one is stripped as a comment. It is already true that no
 *   textual matcher can see the DDL inside a dollar-quoted body — that is the
 *   documented reason the #72 backfill needs grandfathering at all — so this
 *   costs nothing that was not already lost.
 * - A template literal whose `${…}` interpolation itself contains a backtick
 *   ends the literal early. The corpus interpolates nothing into `sql` tags.
 *
 * Both failure modes can only BLANK text, never invent it. Blanking a real
 * `ENABLE` turns the gate red on a table that has RLS: wrong, but loud and
 * immediately visible, which is the direction a security gate should fail in.
 *
 * ## Why this is a module and not a copy
 *
 * The precedence trick below was lifted from a TypeScript-only tokenizer
 * `scripts/eval-harness.test.ts` used to own privately. This is a second
 * consumer with a strictly larger job (it must also reach inside the literals
 * that one preserves), so it lives in `scripts/lib/` next to `orphan-guard`
 * and `page-diff` rather than being pasted a second time. The fold this
 * module's header once listed as an obvious follow-up has since happened:
 * {@link stripTsComments} is that tokenizer, exported, and the eval harness
 * imports it instead of keeping a copy. There is now exactly one `TS_TOKENS`
 * in the repo, and a guard in `scripts/eval-harness.test.ts` fails if a second
 * one reappears there.
 *
 * @module
 */

/**
 * TypeScript string, template and comment tokens, in precedence order.
 *
 * @remarks Order is the whole trick, and it is load-bearing twice over.
 * Scanning left to right with the literal forms listed FIRST means
 * `'https://example.test'` is consumed as a string before its `//` can be read
 * as a comment, and a `//` comment containing an apostrophe is consumed before
 * that apostrophe can open a string. The quoted forms are newline-bounded
 * (the template literal deliberately is not), so an unbalanced quote inside a
 * comment matches nothing and the scan simply moves on.
 */
const TS_TOKENS =
  /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g

/**
 * SQL string, quoted-identifier and comment tokens, in precedence order.
 *
 * @remarks Same trick, one level down. `'--'` as a string literal and
 * `"weird--name"` as a quoted identifier are consumed before their dashes can
 * open a comment, while `-- don't` is consumed as a comment before its
 * apostrophe can open a string, because the scan reaches the dashes first.
 */
const SQL_TOKENS = /'[^'\n]*'|"[^"\n]*"|--[^\n]*|\/\*[\s\S]*?\*\//g

/**
 * SQL *data* tokens: quoted identifiers, dollar-quoted bodies, and strings.
 *
 * @remarks Order again. The double-quoted identifier is listed first because
 * it is the one form that must SURVIVE — the parse regexes match on `"name"`
 * — and the two data forms follow. There is no ambiguity between them at a
 * given position (`"` , `$` and `'` each start only one alternative), so the
 * order beyond that is for reading, not for correctness.
 *
 * The dollar-quote alternative carries a backreference so `$tag$ … $tag$`
 * closes on its own tag and `$$ … $$` closes on the bare form: a
 * non-participating group backreferences the empty string, which makes
 * `\$\1\$` read as `$$` in that case. The lazy body stops at the first
 * matching close.
 *
 * The single-quoted form deliberately spans newlines, unlike its counterpart
 * in {@link SQL_TOKENS}. A multi-line `COMMENT ON … IS '…'` is exactly the
 * shape this needs to blank, and the cost of the looser match is bounded in
 * the safe direction: an odd apostrophe count blanks MORE than intended, which
 * can only withhold an ENABLE and turn the gate red.
 */
const SQL_DATA_TOKENS =
  /"[^"\n]*"|\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$|'[^']*'/g

/** Does this token open a comment in either syntax? */
function isComment(token) {
  return (
    token.startsWith('//') || token.startsWith('--') || token.startsWith('/*')
  )
}

/**
 * Blank the SQL comments inside one template literal, backticks included.
 *
 * @param literal - The template literal token, backticks and all.
 * @returns The same token with `--` and slash-star comment text replaced by a
 * space.
 */
function stripSqlComments(literal) {
  return literal.replace(SQL_TOKENS, (token) =>
    isComment(token) ? ' ' : token,
  )
}

/**
 * TypeScript source with every comment blanked and every literal left alone.
 *
 * @remarks The TypeScript half of {@link stripComments}, on its own, for
 * callers whose source carries no SQL. `scripts/eval-harness.test.ts` is the
 * one that needs it: its question is "does an import specifier appear in
 * CODE", and running the SQL pass over an eval file would additionally blank
 * `--` runs inside template literals — harmless, since blanking can only
 * REMOVE a specifier and never invent one, but it would be answering a
 * question nobody asked. Splitting the pass is cheaper than explaining that.
 *
 * Both exports walk the same {@link TS_TOKENS}, so the precedence reasoning
 * documented there is stated once and cannot drift between two copies, which
 * is the whole reason this function is exported rather than inlined twice.
 *
 * Comment text is replaced by a single space rather than deleted, so two
 * identifiers never fuse across a stripped comment.
 *
 * @param source - Raw TypeScript source.
 * @returns The same source with comment text replaced by a space.
 */
export function stripTsComments(source) {
  return source.replace(TS_TOKENS, (token) => (isComment(token) ? ' ' : token))
}

/**
 * Migration source with every comment blanked and every statement left alone.
 *
 * @remarks {@link stripTsComments} plus a second pass INSIDE each template
 * literal, because a migration's payload is SQL and `--` is a comment there.
 *
 * Comment text is replaced by a single space rather than deleted, so two
 * identifiers never fuse across a stripped comment.
 *
 * @param source - Raw migration source (TypeScript containing `sql` template
 * literals).
 * @returns The same source with TypeScript and SQL comment text blanked.
 */
export function stripComments(source) {
  return source.replace(TS_TOKENS, (token) => {
    if (isComment(token)) return ' '
    if (token.startsWith('`')) return stripSqlComments(token)
    return token
  })
}

/**
 * Blank the SQL comments AND data inside one template literal.
 *
 * @remarks Comments go first, and the order is not incidental. Blanking them
 * up front means the data scan never meets a stray apostrophe inside `-- don't
 * do this`, which would otherwise open a string literal and blank everything
 * up to the next quote. Running the passes the other way round would make the
 * result depend on the prose in the comments.
 *
 * This composition is also what makes {@link stripSqlData} correct on its own,
 * rather than only when a caller remembers to run {@link stripComments} first.
 *
 * @param literal - The template literal token, backticks and all.
 * @returns The same token with comment, string-literal and dollar-quoted
 * content replaced by a space, and quoted identifiers left intact.
 */
function stripSqlDataInLiteral(literal) {
  return stripSqlComments(literal).replace(SQL_DATA_TOKENS, (token) =>
    token.startsWith('"') ? token : ' ',
  )
}

/**
 * Blank a quoted TypeScript string's content, keeping its delimiters.
 *
 * @remarks The delimiters stay for a reason: the result must not be able to
 * read as something else. Replacing the token whole would leave a run of
 * spaces where a name used to be, and `ALTER TABLE   ENABLE ROW LEVEL
 * SECURITY` invites the identifier alternative to latch onto whatever word
 * follows. An empty `''` or `""` pair cannot satisfy `"([^"]+)"` and cannot
 * start a bare identifier, so the blanked string is inert by construction.
 *
 * Keeping them also makes idempotence obvious: the result is still exactly one
 * string token, so a second pass blanks an already-blank body and changes
 * nothing. Length is preserved for the same reason — the character offsets a
 * reader compares against the original stay put.
 *
 * @param token - A complete quoted string token, delimiters included.
 * @returns The token with its body replaced by spaces.
 */
function blankStringBody(token) {
  const quote = token[0]
  return quote + ' '.repeat(Math.max(token.length - 2, 0)) + quote
}

/**
 * A bare `sql` tag sitting immediately before a template literal.
 *
 * @remarks The tag is not part of the token `TS_TOKENS` produces — that starts
 * at the backtick — so it has to be read from the source preceding the match.
 *
 * `(?:^|[^A-Za-z0-9_$.])` is the identifier boundary, and it does two jobs.
 * Excluding identifier characters stops `mysql` and `notsql` from passing as
 * the tag. Excluding `.` additionally treats a member expression such as
 * `db.sql` as untagged: the corpus imports `sql` from
 * `@payloadcms/db-postgres` and uses it bare, so anything fancier is data
 * until someone proves otherwise — and "proving otherwise" costs one red run,
 * not a silent hole.
 *
 * `\s*$` allows the whitespace prettier inserts when it breaks
 * `db.execute(sql`…`)` across lines, which the committed
 * `20260828_155359_corvus_embeddings.ts` does.
 */
const SQL_TAGGED_TEMPLATE = /(?:^|[^A-Za-z0-9_$.])sql\s*$/

/**
 * Migration source with comments AND SQL string data blanked.
 *
 * @remarks The view used to decide that RLS **is enforced** — and only that.
 * {@link stripComments} answers "what does this migration say"; this answers
 * the strictly narrower "what will this migration EXECUTE", by additionally
 * blanking every place text can sit without being a statement:
 *
 * - **SQL string literals.** `COMMENT ON TABLE "widgets" IS 'run ALTER TABLE
 *   "widgets" ENABLE ROW LEVEL SECURITY later'` is a note to a human. Matching
 *   it discharged a real `CREATE TABLE` and the gate went green over a table
 *   with no RLS.
 * - **Dollar-quoted bodies** (`$$ … $$`, `$tag$ … $tag$`). A `DO` block's body
 *   is a string to the outer parser, and what it executes may be conditional,
 *   built by `format()`, or — as in `IF false THEN … END IF` — never run at
 *   all.
 * - **TypeScript string literals**, in either quote. `const note = 'ALTER
 *   TABLE "widgets" ENABLE ROW LEVEL SECURITY'` is a variable holding prose;
 *   it executes nothing, and it was crediting a real obligation. Only the body
 *   is blanked — see {@link blankStringBody} for why the quotes stay.
 * - **Untagged template literals**, and templates carrying any tag other than
 *   `sql`. A backtick is not a promise to execute: the same prose in a
 *   different quote.
 *
 * Quoted identifiers INSIDE the SQL survive, because `"name"` is what the
 * parse regexes match on; blanking those would blank the answer along with the
 * question. A double-quoted TYPESCRIPT string is a different thing in a
 * different place, and is blanked like any other string.
 *
 * ## Allowlist, not blocklist
 *
 * This view has been wrong five times, and always the same way: it started
 * from "all text" and subtracted the shapes that had already burned it —
 * comments, then SQL strings, then dollar-quoted bodies, then TypeScript
 * strings. Subtraction cannot terminate, because the next shape nobody has
 * thought of is still in the set by default.
 *
 * Template literals are handled the other way round. Only an `sql`-tagged one
 * can reach the database, so ONLY that is kept as SQL and everything else
 * wearing backticks is blanked. The polarity is what matters: an allowlist
 * that is too narrow withholds a credit and goes RED, which a human sees and
 * clears; a blocklist with a gap discharges an obligation and goes GREEN over
 * an unprotected table. For a credit view, only one of those is survivable.
 *
 * Two residuals, both landing on the red side and neither reachable from the
 * committed corpus (every DDL there is a literal `sql` template, with no
 * interpolation and no `sql.raw` — measured):
 *
 * - An `ENABLE` genuinely executed from a string or an untagged template —
 *   `db.execute(sql.raw(stmt))` — is not credited, so that migration goes red.
 *   The fix is to write the statement as a literal `sql` template, which the
 *   convention asks for anyway.
 * - `TS_TOKENS` ends a template at the first unescaped backtick, so a template
 *   NESTED inside an `${…}` interpolation desynchronises it: the outer
 *   literal's tail is then seen as a separate, untagged token and blanked.
 *   Stated rather than glossed — the result is a withheld credit, i.e. red,
 *   and a real parser is the only complete answer if that day comes.
 *
 * ## Why this is not used for the CREATE scan
 *
 * The two scans are deliberately asymmetric, and the asymmetry is the whole
 * design rather than an oversight to tidy up.
 *
 * An `ENABLE` is a CREDIT against an obligation, so it must be provably
 * executable — hence this view. A `CREATE TABLE` is the OBLIGATION itself, and
 * obligations are counted from {@link stripComments} instead, where string
 * data still counts. A table created by `EXECUTE 'CREATE TABLE …'` inside a
 * `DO` block — or by `sql.raw(someString)` — is a REAL table; blanking data
 * for that scan too would hide it, and hide its missing RLS with it. This is
 * why {@link stripComments} keeps string literals in BOTH languages and only
 * this view blanks them.
 *
 * Line the error directions up and the choice makes itself. Over-counting an
 * obligation, or under-counting a credit, costs a RED on a table that is fine
 * — loud, and a human clears it. Under-counting an obligation, or
 * over-counting a credit, costs a GREEN on a table shipped without RLS, which
 * is the single outcome this gate exists to prevent. Both of this module's
 * views therefore fail toward red.
 *
 * The residual, stated plainly: a table both CREATEd and RLS-enabled entirely
 * inside a dollar-quoted body goes red, because the credit is invisible while
 * the obligation is not. That is correct behavior for a gate that cannot read
 * dynamic SQL — the same reason the #72 backfill's `pg_tables` loop needs
 * grandfathering rather than parsing — and the fix for such a migration is to
 * add a literal `ENABLE`, which is what the convention asks for anyway.
 *
 * @param source - Raw migration source (TypeScript containing `sql` template
 * literals).
 * @returns The same source with comments and SQL data blanked, quoted
 * identifiers preserved.
 */
export function stripSqlData(source) {
  return source.replace(TS_TOKENS, (token, offset, whole) => {
    if (isComment(token)) return ' '
    if (token.startsWith('`')) {
      // The tag sits BEFORE the token, so it has to be read from the source
      // preceding this match. Untagged, or tagged with anything else, is data.
      return SQL_TAGGED_TEMPLATE.test(whole.slice(0, offset))
        ? stripSqlDataInLiteral(token)
        : blankStringBody(token)
    }
    // Every remaining token is a quoted TypeScript string — TS_TOKENS matches
    // nothing else. There is no fallthrough that returns text unexamined,
    // which is exactly how the previous versions let these through.
    return blankStringBody(token)
  })
}

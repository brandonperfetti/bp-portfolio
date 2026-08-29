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
 * `scripts/eval-harness.test.ts` already owns a TypeScript-only tokenizer of
 * the same shape, and the precedence trick below is lifted from it. This is a
 * second consumer with a strictly larger job (it must also reach inside the
 * literals that one preserves), so it lives in `scripts/lib/` next to
 * `orphan-guard` and `page-diff` rather than being pasted a second time.
 * Folding the eval harness onto this module is the obvious follow-up and was
 * deliberately not done here: that file is outside this change's scope.
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
 * Migration source with every comment blanked and every statement left alone.
 *
 * @remarks Comment text is replaced by a single space rather than deleted, so
 * two identifiers never fuse across a stripped comment.
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
 *
 * Quoted identifiers INSIDE the SQL survive, because `"name"` is what the
 * parse regexes match on; blanking those would blank the answer along with the
 * question. A double-quoted TYPESCRIPT string is a different thing in a
 * different place, and is blanked like any other string.
 *
 * The residual worth naming: an `ENABLE` that really is executed from a
 * TypeScript string — `db.execute(sql.raw(stmt))` — is no longer credited, so
 * such a migration goes red. That is the correct direction (see below), the
 * committed corpus does not do it (every DDL there is written literally in a
 * `sql` template), and the fix for one that did is to write the statement
 * literally, which is what the convention asks for anyway.
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
  return source.replace(TS_TOKENS, (token) => {
    if (isComment(token)) return ' '
    if (token.startsWith('`')) return stripSqlDataInLiteral(token)
    // Every remaining token is a quoted TypeScript string — TS_TOKENS matches
    // nothing else. There is no fallthrough that returns text unexamined,
    // which is exactly how the previous version let these through.
    return blankStringBody(token)
  })
}

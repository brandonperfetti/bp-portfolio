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

// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { stripComments, stripSqlData } from './sql-comments.mjs'

/**
 * The tokenizer behind the RLS gate's "commented SQL is not enforcement" rule.
 *
 * Two properties matter and they pull against each other: comments in BOTH
 * syntaxes must disappear, and the SQL inside the template literals must
 * survive completely intact — it is the only thing the gate actually reads.
 */
describe('stripComments', () => {
  describe('removes comments', () => {
    it('blanks a TypeScript line comment', () => {
      const source = [
        '// ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;',
        'const kept = 1',
      ].join('\n')

      expect(stripComments(source)).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripComments(source)).toContain('const kept = 1')
    })

    it('blanks a TypeScript block comment, doc comments included', () => {
      const source = [
        '/* ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY; */',
        '/**',
        ' * Historical: this used to CREATE TABLE "gone".',
        ' */',
      ].join('\n')

      expect(stripComments(source)).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripComments(source)).not.toContain('CREATE TABLE')
    })

    /**
     * The half a TypeScript-only pass would miss. The dashes live INSIDE the
     * `sql` template literal, which pass 1 must preserve wholesale.
     */
    it('blanks a SQL line comment inside a template literal', () => {
      const source = [
        'await db.execute(sql`',
        '  -- ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;',
        '  CREATE TABLE "widgets" ("id" bigserial PRIMARY KEY);',
        '`)',
      ].join('\n')

      const stripped = stripComments(source)

      expect(stripped).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripped).toContain('CREATE TABLE "widgets"')
    })

    it('blanks a SQL block comment inside a template literal', () => {
      const source = [
        'await db.execute(sql`',
        '  /* ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY; */',
        '  CREATE TABLE "widgets" ("id" bigserial PRIMARY KEY);',
        '`)',
      ].join('\n')

      const stripped = stripComments(source)

      expect(stripped).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripped).toContain('CREATE TABLE "widgets"')
    })

    it('leaves a space behind so identifiers cannot fuse', () => {
      expect(stripComments('a/* gap */b')).toBe('a b')
    })
  })

  describe('keeps executable SQL', () => {
    it('preserves a real statement in a template literal untouched', () => {
      const source =
        'await db.execute(sql`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;`)'

      expect(stripComments(source)).toBe(source)
    })

    it('preserves a multi-statement literal verbatim', () => {
      const source = [
        'await db.execute(sql`',
        '  CREATE TABLE IF NOT EXISTS "widgets" (',
        '    "id" bigserial PRIMARY KEY,',
        '    "visibility" text NOT NULL DEFAULT \'public\'',
        '  );',
        '`)',
      ].join('\n')

      expect(stripComments(source)).toBe(source)
    })

    /**
     * The dashes are data, not a comment. Listing the string form first is
     * what makes the scan reach the quote before the dashes.
     *
     * Still a real assertion now that `stripSqlData` exists: THIS view keeps
     * string literals, so the string has to survive as a string rather than be
     * blanked. `stripSqlData` blanks it instead, and has its own case for that
     * — the two views differ here on purpose.
     */
    it('does not read dashes inside a SQL string literal as a comment', () => {
      const source =
        'await db.execute(sql`INSERT INTO "t" ("v") VALUES (\'--\'); ALTER TABLE "t" ENABLE ROW LEVEL SECURITY;`)'

      expect(stripComments(source)).toContain('ENABLE ROW LEVEL SECURITY')
    })

    it('does not read dashes inside a quoted identifier as a comment', () => {
      const source =
        'await db.execute(sql`ALTER TABLE "odd--name" ENABLE ROW LEVEL SECURITY;`)'

      expect(stripComments(source)).toBe(source)
    })

    /**
     * The mirror case: an apostrophe inside a SQL comment must not open a
     * string and swallow the statement on the following line.
     */
    it('does not let an apostrophe in a SQL comment swallow the next line', () => {
      const source = [
        'await db.execute(sql`',
        "  -- don't enable it here",
        '  ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;',
        '`)',
      ].join('\n')

      const stripped = stripComments(source)

      expect(stripped).toContain('ALTER TABLE "widgets" ENABLE ROW LEVEL')
      expect(stripped).not.toContain("don't")
    })

    it('does not let an apostrophe in a TypeScript comment swallow code', () => {
      const source = [
        "// the table's RLS follow-up landed separately",
        'await db.execute(sql`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;`)',
      ].join('\n')

      expect(stripComments(source)).toContain('ENABLE ROW LEVEL SECURITY')
    })

    it('keeps a URL in a string literal, its double slash intact', () => {
      const source = "const doc = 'https://example.test/payload'"

      expect(stripComments(source)).toBe(source)
    })

    /**
     * A decrement operator is not a SQL comment. Pass 2 runs only inside
     * template literals precisely so this stays true.
     */
    it('leaves a TypeScript decrement operator alone', () => {
      const source = 'let n = 3\nn--\nconst after = n'

      expect(stripComments(source)).toBe(source)
    })
  })

  it('is idempotent', () => {
    const source = [
      '// ALTER TABLE "a" ENABLE ROW LEVEL SECURITY;',
      'await db.execute(sql`',
      '  -- ALTER TABLE "b" ENABLE ROW LEVEL SECURITY;',
      '  CREATE TABLE "c" ("id" bigserial PRIMARY KEY);',
      '`)',
    ].join('\n')

    const once = stripComments(source)

    expect(stripComments(once)).toBe(once)
  })
})

/**
 * The narrower view, used only to decide that RLS IS enforced.
 *
 * `stripComments` answers "what does this migration say". This answers "what
 * will it EXECUTE" — so on top of comments it blanks the two places SQL keeps
 * text that is data rather than a statement, while leaving quoted identifiers
 * alone because those are what the gate's parse regexes match on.
 */
describe('stripSqlData', () => {
  describe('blanks text that never executes', () => {
    it('blanks a string literal, so a COMMENT ON cannot enforce anything', () => {
      const source =
        'await db.execute(sql`COMMENT ON TABLE "widgets" IS \'run ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY later\';`)'

      const stripped = stripSqlData(source)

      expect(stripped).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripped).toContain('COMMENT ON TABLE "widgets" IS')
    })

    it('blanks a multi-line string literal too', () => {
      const source = [
        'await db.execute(sql`',
        '  COMMENT ON TABLE "widgets" IS \'first line',
        '    ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY',
        "  last line';",
        '`)',
      ].join('\n')

      expect(stripSqlData(source)).not.toContain('ENABLE ROW LEVEL SECURITY')
    })

    it('blanks a bare dollar-quoted body', () => {
      const source = [
        'await db.execute(sql`',
        '  DO $$',
        '  BEGIN',
        '    IF false THEN',
        '      EXECUTE \'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY\';',
        '    END IF;',
        '  END $$;',
        '`)',
      ].join('\n')

      expect(stripSqlData(source)).not.toContain('ENABLE ROW LEVEL SECURITY')
    })

    it('blanks a TAGGED dollar-quoted body, closing on its own tag', () => {
      const source = [
        'await db.execute(sql`',
        '  DO $rls$',
        '    EXECUTE \'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY\';',
        '  $rls$;',
        '  ALTER TABLE "kept" ENABLE ROW LEVEL SECURITY;',
        '`)',
      ].join('\n')

      const stripped = stripSqlData(source)

      expect(stripped).not.toContain('"widgets" ENABLE')
      // The body closed on $rls$, so the statement after it survives.
      expect(stripped).toContain('ALTER TABLE "kept" ENABLE ROW LEVEL SECURITY')
    })

    it('blanks comments as well, like the wider view', () => {
      const source = [
        '// ALTER TABLE "a" ENABLE ROW LEVEL SECURITY;',
        'await db.execute(sql`',
        '  -- ALTER TABLE "b" ENABLE ROW LEVEL SECURITY;',
        '`)',
      ].join('\n')

      expect(stripSqlData(source)).not.toContain('ENABLE ROW LEVEL SECURITY')
    })
  })

  describe('keeps what the gate reads', () => {
    it('leaves a real statement and its quoted identifiers untouched', () => {
      const source =
        'await db.execute(sql`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;`)'

      expect(stripSqlData(source)).toBe(source)
    })

    it('preserves a quoted identifier containing dashes', () => {
      const source =
        'await db.execute(sql`ALTER TABLE "odd--name" ENABLE ROW LEVEL SECURITY;`)'

      expect(stripSqlData(source)).toBe(source)
    })

    it('keeps a CREATE TABLE and its column identifiers', () => {
      const source = [
        'await db.execute(sql`',
        '  CREATE TABLE IF NOT EXISTS "widgets" (',
        '    "id" bigserial PRIMARY KEY,',
        '    "visibility" text NOT NULL DEFAULT \'public\'',
        '  );',
        '`)',
      ].join('\n')

      const stripped = stripSqlData(source)

      expect(stripped).toContain('CREATE TABLE IF NOT EXISTS "widgets"')
      expect(stripped).toContain('"visibility"')
      // Only the DEFAULT's data went.
      expect(stripped).not.toContain("'public'")
    })

    /**
     * The shape the committed corvus_embeddings migration uses: a literal
     * ENABLE alongside a DO block doing unrelated REVOKE work. The DO body
     * goes; the real statement stays.
     */
    it('keeps a real ENABLE standing beside a dollar-quoted DO block', () => {
      const source = [
        'await db.execute(sql`ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;`)',
        'await db.execute(sql`',
        '  DO $$',
        '  BEGIN',
        "    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN",
        "      EXECUTE 'REVOKE ALL ON TABLE public.widgets FROM anon';",
        '    END IF;',
        '  END $$;',
        '`)',
      ].join('\n')

      const stripped = stripSqlData(source)

      expect(stripped).toContain(
        'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY',
      )
      expect(stripped).not.toContain('pg_roles')
    })

    /**
     * TypeScript code that contains no string literal at all is returned
     * byte-for-byte. This is the identity half of the contract, kept separate
     * from the string case below now that the two differ.
     */
    it('leaves TypeScript with no string literals alone', () => {
      const source = 'let n = 3\nn--\nconst after = n\n'

      expect(stripSqlData(source)).toBe(source)
    })
  })

  /**
   * A plain TypeScript string is data too.
   *
   * `const note = 'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY'` executes
   * nothing, but the credit scan read the text straight out of it. The narrow
   * view therefore blanks TS string CONTENT as well — keeping the delimiters,
   * so the token boundaries the scan relies on stay exactly where they were.
   */
  describe('blanks TypeScript string data', () => {
    it('blanks a single-quoted string, keeping its quotes', () => {
      const source =
        'const note = \'ALTER TABLE "w" ENABLE ROW LEVEL SECURITY\''

      const stripped = stripSqlData(source)

      expect(stripped).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripped).toMatch(/^const note = ' +'$/)
    })

    it('blanks a double-quoted string, keeping its quotes', () => {
      const source = 'const note = "ALTER TABLE x ENABLE ROW LEVEL SECURITY"'

      const stripped = stripSqlData(source)

      expect(stripped).not.toContain('ENABLE ROW LEVEL SECURITY')
      expect(stripped).toMatch(/^const note = " +"$/)
    })

    /**
     * Delimiters are kept rather than blanking the token whole so the result
     * can never read as a bare identifier: `ALTER TABLE '' ENABLE …` cannot
     * satisfy the parse regex, where a run of spaces might let it latch onto
     * the following word.
     */
    it('leaves an empty pair that no identifier pattern can match', () => {
      const source = "const empty = ''"

      expect(stripSqlData(source)).toBe(source)
    })

    it('blanks the collection-slug string a migration might carry', () => {
      const source = "const slug = 'posts'"

      expect(stripSqlData(source)).toBe("const slug = '     '")
    })

    /**
     * The wide view is deliberately unchanged: it answers "what does this
     * migration say", and obligations are read from it. A TS string still
     * counts there, which is what keeps a `CREATE TABLE` in one from going
     * silently unobligated.
     */
    it('is the only view that does this — stripComments keeps TS strings', () => {
      const source = 'const note = \'CREATE TABLE "ghost" ()\''

      expect(stripComments(source)).toBe(source)
    })
  })

  it('is idempotent', () => {
    const source = [
      'const note = \'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY\'',
      'await db.execute(sql`',
      '  COMMENT ON TABLE "widgets" IS \'ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY\';',
      '  DO $$ EXECUTE \'CREATE TABLE "x" ()\'; END $$;',
      '  ALTER TABLE "widgets" ENABLE ROW LEVEL SECURITY;',
      '`)',
    ].join('\n')

    const once = stripSqlData(source)

    expect(stripSqlData(once)).toBe(once)
  })
})

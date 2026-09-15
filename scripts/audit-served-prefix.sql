-- audit-served-prefix.sql — the served-prefix invariant (#180), as a query.
--
-- THE INVARIANT: every served page's ancestors are served too. A published
-- document whose parent page is not published is the one way a live URL comes
-- to sit under a prefix the site does not serve, and it is what made a subtree
-- move have no served parent path to key its `matchDescendants` redirect row
-- on (docs/PAYLOAD.md, "Moving a page moves its subtree").
--
-- Since #180 both halves are refused at PUBLISH time by
-- `src/collections/Pages/hooks/servedPrefix.ts`, and the unpublish mirror
-- refuses too. This file is how a violation created BEFORE those guards is
-- found rather than assumed away — run it once against staging and once
-- against production.
--
-- EXPECTED RESULT: 0 rows from queries 1 and 2, and exactly one row from query
-- 3 reading `AUDIT_SERVED_PREFIX_VIOLATIONS=0`. Query 3 ALWAYS returns a row —
-- it is a count, not a violation list, and its row is what tells a runner the
-- file finished (see WHO RUNS IT). A row from query 1 or 2 is a real violation
-- and needs an editorial decision (publish the parent, or unpublish the child);
-- nothing here writes, so it is safe to run against production.
--
-- HOW TO RUN. Both statements read only the MAIN tables — the rows the site
-- actually serves — never `_pages_v` / `_posts_v`, where an unpublished draft
-- legitimately carries `_status = 'draft'` and means nothing about a URL.
--
--   psql "$DATABASE_URI" -f scripts/audit-served-prefix.sql
--
-- `DATABASE_URI` is the environment variable NAME. Take its value from the
-- deployment's own environment (Vercel project settings); never paste a
-- connection string, a password or any other secret value into this file or
-- into a commit message.
--
-- WHO RUNS IT (#206). `.github/workflows/audit-served-prefix.yml` runs exactly
-- the command above against production every week and FAILS the job on a
-- non-zero total (exit 1); a run that never produced query 3's line exits 2
-- instead, so an error is distinguishable from a violation without reading the
-- log. Query 3 below exists for that job: a human reads the rows, a runner
-- needs one line it can parse, and the runner must be able to tell "no
-- violations" from "the query never ran" — which is why the total is printed
-- as a tagged line rather than inferred from an empty result set.

\echo '== 1. Published PAGES whose parent page is not published =='

SELECT
  child.id            AS page_id,
  child.slug          AS page_slug,
  child.path          AS served_path,
  parent.id           AS parent_id,
  parent.slug         AS parent_slug,
  parent._status      AS parent_status
FROM pages AS child
JOIN pages AS parent
  ON parent.id = child.parent_id
WHERE child._status = 'published'
  -- `IS DISTINCT FROM`, not `<>`: `_status` is NULLABLE. The column is declared
  -- `DEFAULT 'draft'` with no NOT NULL (migration 20260722_033130), so
  -- `NULL <> 'published'` evaluates to NULL rather than true and a `<>` here
  -- silently drops every parent whose status is unset. Those are exactly the
  -- rows this file exists to find: a NULL gets in only by a write that went
  -- around the publish guards, which is the same way the violations predating
  -- those guards did. The comparison that hides them is the one that would make
  -- this audit answer "0 rows" for a database that has the defect.
  AND parent._status IS DISTINCT FROM 'published'
ORDER BY child.path;

\echo '== 2. Published PLACED POSTS whose parent page is not published =='

-- Only PLACED posts can violate this. An unplaced post has `parent_id IS NULL`
-- and a NULL `path`; it is served at /articles/<slug>, a namespace no page
-- prefix governs, so it has no ancestor to be inconsistent with. The join
-- itself excludes them.
SELECT
  post.id             AS post_id,
  post.slug           AS post_slug,
  post.path           AS served_path,
  parent.id           AS parent_id,
  parent.slug         AS parent_slug,
  parent._status      AS parent_status
FROM posts AS post
JOIN pages AS parent
  ON parent.id = post.parent_id
WHERE post._status = 'published'
  -- Nullable `_status` again; see query 1 for why `<>` would hide a violation.
  AND parent._status IS DISTINCT FROM 'published'
ORDER BY post.path;

\echo '== 3. Machine-readable total (the line the weekly workflow parses) =='

-- The runner's whole signal, on one line: `AUDIT_SERVED_PREFIX_VIOLATIONS=<n>`.
--
-- Why a tagged line and not a row count. A workflow that concluded "clean"
-- from an empty result set would conclude the same thing from a query that
-- errored, a connection that dropped mid-file, or a `psql` invoked against the
-- wrong database — the failure mode #206 exists to remove, reintroduced one
-- layer up. The tag is emitted only by a statement that actually ran to
-- completion, so its ABSENCE is an error and `=0` is a clean bill of health.
-- The two are then distinguishable without reading the log.
--
-- The predicates below are the two above, restated. That duplication is
-- deliberate and it is TESTED rather than trusted:
-- `evals/audit-served-prefix-integration.test.ts` seeds one page violation and
-- one post violation and asserts this total is 2 while queries 1 and 2 return
-- one row each, so a predicate that drifts out of step fails the build. The
-- alternative — a temp view the three statements share — would make this file
-- write to the session's temp schema, and "read-only, safe against
-- production" is a property worth more than six duplicated lines.
SELECT
  'AUDIT_SERVED_PREFIX_VIOLATIONS='
  || (
    (
      SELECT count(*)
      FROM pages AS child
      JOIN pages AS parent
        ON parent.id = child.parent_id
      WHERE child._status = 'published'
        AND parent._status IS DISTINCT FROM 'published'
    )
    + (
      SELECT count(*)
      FROM posts AS post
      JOIN pages AS parent
        ON parent.id = post.parent_id
      WHERE post._status = 'published'
        AND parent._status IS DISTINCT FROM 'published'
    )
  ) AS audit_total;

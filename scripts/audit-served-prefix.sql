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
-- EXPECTED RESULT: 0 rows from each query. A row is a real violation and needs
-- an editorial decision (publish the parent, or unpublish the child); nothing
-- here writes, so it is safe to run against production.
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

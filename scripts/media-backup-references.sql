-- Every media file in one database, for scripts/media-backup.ts (#328).
--
-- Read-only, enforced here and not by the connection: Supabase's Supavisor
-- pooler drops libpq startup options such as default_transaction_read_only
-- (supabase/supavisor#1272; #1273 adds only a notice), so PGOPTIONS cannot be
-- relied on. The query runs inside BEGIN READ ONLY, asserts that the
-- transaction really is read-only before reading, and stops otherwise. Local
-- timeouts bound its cost on production. Run it with psql -q, so the BEGIN,
-- SET, DO and COMMIT command tags stay out of the JSONL output.
-- One JSON object per row, so values carrying newlines or tabs stay one line:
--   {"kind":"filename","column":"<column>","value":"<filename>"}
--     every media row's stored filename and, should the collection ever
--     define image sizes, each size variant's filename (`sizes_<name>_filename`
--     columns, found by name, so a size added later needs no edit here). A
--     filename is the file's Blob pathname only while the row is flat (below).
--   {"kind":"coordinates","column":"prefix"|"_objectkey"}
--     one per media row whose `prefix` is non-empty or whose `_objectkey` is
--     set (#339). Since Payload 3.90 the storage adapter stores and serves a
--     file at `prefix/_objectKey/filename`, so for such a row the filename
--     is NOT the pathname, and a check at the filename can vouch for another
--     object. Media is kept flat (`refuseStorageCoordinateWrite` in
--     src/collections/Media.ts), so any such row is a broken invariant:
--     scripts/media-backup.ts refuses the whole output and the job exits
--     non-zero. The value is not printed: only that the row has one. The
--     columns are read through to_jsonb, so a database not yet migrated to
--     them simply has none.
--   {"kind":"end","count":<n>}
--     printed last, only by a statement that completed, so an empty or
--     truncated result is never read as "no references"; <n> counts every
--     row above it, of both kinds
--
-- Scope (owner's decision, #328): the media table's files only. Store URLs
-- written into text or JSON columns are not read: deciding where a URL
-- inside prose or markup ends is a guess, and on the local restore every such
-- URL named a file the media table already lists.

\set ON_ERROR_STOP on

begin transaction read only;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '180s';
do $$
begin
  if current_setting('transaction_read_only') <> 'on' then
    raise exception 'media references: not in a read-only transaction';
  end if;
end
$$;

with refs as (
  select f.key as col, f.value
  from public.media m
  cross join lateral jsonb_each_text(to_jsonb(m)) as f(key, value)
  where (f.key = 'filename' or f.key ~ '^sizes_.+_filename$')
    and f.value is not null
    and f.value <> ''
),
coords as (
  select f.key as col
  from public.media m
  cross join lateral jsonb_each_text(to_jsonb(m)) as f(key, value)
  where f.key in ('prefix', '_objectkey')
    and f.value is not null
    and f.value <> ''
)
select line from (
  select 0 as ord, json_build_object('kind', 'filename', 'column', col, 'value', value)::text as line
  from refs
  union all
  select 0, json_build_object('kind', 'coordinates', 'column', col)::text
  from coords
  union all
  select 1, json_build_object('kind', 'end', 'count',
    (select count(*) from refs) + (select count(*) from coords))::text
) lines
order by ord;

commit;

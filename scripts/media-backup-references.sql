-- Every media reference in one database, for scripts/media-backup.ts (#328).
--
-- Read-only, enforced here and not by the connection: Supabase's Supavisor
-- pooler drops libpq startup options such as default_transaction_read_only
-- (supabase/supavisor#1272; #1273 adds only a notice), so PGOPTIONS cannot be
-- relied on. The query runs inside BEGIN READ ONLY, asserts that the
-- transaction really is read-only before reading, and stops otherwise. Local
-- timeouts bound its cost on production. Run it with psql -q, so the BEGIN,
-- SET, DO and COMMIT command tags stay out of the JSONL output.
-- One JSON object per row, so values carrying newlines or tabs stay one line:
--   {"kind":"filename","table":"media","value":"<filename>"}
--     every media row's stored filename (its Blob pathname: media has no prefix)
--   {"kind":"text"|"json","table":"<table>","value":"<column text>"}
--     every text (`text`) or json/jsonb (`json`) value, in any public table,
--     that holds a public Blob URL (stored urls, rich text, SEO fields,
--     version history); the kind tells the script whether it can parse the
--     value as JSON, which gives each URL its exact boundary
--   {"kind":"end","count":<n>}
--     printed last, only by a statement that completed, so an empty or
--     truncated result is never read as "no references"
--
-- Text columns are scanned generically with query_to_xml rather than by a
-- list of known fields, so a field added later is covered without editing
-- this file. The values come back XML-escaped; the script unescapes them.

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
  select 'filename' as kind, 'media' as tbl, filename as value
  from public.media
  where filename is not null and filename <> ''

  union all

  select
    case when c.data_type in ('json', 'jsonb') then 'json' else 'text' end,
    c.table_name,
    x.v::text
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name = c.table_name
   and t.table_type = 'BASE TABLE'
  cross join lateral unnest(
    xpath(
      '/table/row/v/text()',
      query_to_xml(
        format(
          'select %I::text as v from %I.%I where %I::text like %L',
          c.column_name,
          c.table_schema,
          c.table_name,
          c.column_name,
          '%.public.blob.vercel-storage.com/%'
        ),
        true,
        false,
        ''
      )
    )
  ) as x(v)
  where c.table_schema = 'public'
    and c.data_type in ('text', 'character varying', 'json', 'jsonb')
)
select line from (
  select 0 as ord, json_build_object('kind', kind, 'table', tbl, 'value', value)::text as line
  from refs
  union all
  select 1, json_build_object('kind', 'end', 'count', (select count(*) from refs))::text
) lines
order by ord;

commit;

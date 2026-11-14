-- Every media reference in one database, for scripts/media-backup.ts (#328).
--
-- Read-only: the workflow runs this with default_transaction_read_only=on.
-- One JSON object per row, so values carrying newlines or tabs stay one line:
--   {"kind":"filename","table":"media","value":"<filename>"}
--     every media row's stored filename (its Blob pathname: media has no prefix)
--   {"kind":"text","table":"<table>","value":"<column text>"}
--     every text/json value, in any public table, that embeds a public Blob
--     URL (rich text, SEO fields, version history); the script extracts them
--   {"kind":"end","count":<n>}
--     printed last, only by a statement that completed, so an empty or
--     truncated result is never read as "no references"
--
-- Text columns are scanned generically with query_to_xml rather than by a
-- list of known fields, so a field added later is covered without editing
-- this file. The values come back XML-escaped; the script unescapes them.

with refs as (
  select 'filename' as kind, 'media' as tbl, filename as value
  from public.media
  where filename is not null and filename <> ''

  union all

  select 'text', c.table_name, x.v::text
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

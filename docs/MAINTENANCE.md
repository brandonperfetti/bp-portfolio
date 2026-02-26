# Maintenance

## Routine Checks

- Keep dependencies patched (`npm audit`, selective upgrades).
- Rebuild and verify API routes after Next.js minor upgrades.
- Ensure Markdown/code-block rendering still works after remark/rehype updates.

## Content Hygiene

- Keep article slugs stable after publish.
- Validate dates and `Topics/Tags` values for consistency.
- Keep `Tech` values tool/framework specific (avoid concept tags like `Design` or `Observability` in `Tech`).
- Confirm `Search Index` is being populated on `Portfolio CMS - Articles` after projection sync runs.

## Integration Hygiene

- Rotate API tokens periodically (SendGrid, OpenAI, GitHub PATs).
- Re-validate SendGrid permissions/scopes when subscription flow changes.
- Verify `NEXT_PUBLIC_SITE_URL` for each environment before release.
- For Notion mode, verify webhook signature and projection sync remain healthy:
  - `/api/webhooks/notion`
  - `/api/cms/sync/articles`

## Known Operational Notes

- Home-page newsletter card is intentionally hidden temporarily, but mailing list API route remains available.
- Hermes route intentionally suppresses footer to minimize outer scroll and keep chat UX focused.

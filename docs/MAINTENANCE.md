# Maintenance

## Routine Checks

- Keep dependencies patched (`npm audit`, selective upgrades).
- Rebuild and verify API routes after Next.js minor upgrades.
- Ensure Markdown/code-block rendering still works after remark/rehype updates.
- If local hooks stop running, re-run `npm run prepare` to restore Husky hook wiring.

## Content Hygiene

- Keep article slugs stable after publish.
- Validate dates and `Topics/Tags` values for consistency.
- Keep `Content Pillar` populated (`Mindset`, `Software`, `Design`, `Leadership`, `Product Execution`) so brand coverage stays balanced.
- Keep `Tech` values tool/framework specific (avoid concept tags like `Design` or `Observability` in `Tech`).
- Confirm `Search Index` is being populated on `Portfolio CMS - Articles` after projection sync runs.
- Run `/api/cms/sync/articles/quality-gate` to catch publish-safe source rows missing `Review Round`, `Recovery Status`, `Has Required Metadata`, `Cover Style Profile`, or `Content Pillar`.
- Run `/api/cms/sync/articles/auto-heal` to fill missing SOP defaults on publish-safe source rows (including `Content Pillar`).
- Keep `Cover Style Profile` populated for style consistency; auto-heal sets defaults from `Article Type` if missing.
- Run `/api/cms/sync/articles/cover-regeneration` to process rows with `Regenerate Cover Requested`.
- Schedule `/api/cron/cms-integrity` (frequent) and `/api/cron/cms-cover-regeneration` (slower) in Vercel Cron for production automation.
- Schedule `/api/cron/cms-cleanup` weekly for archival cleanup (stale failed webhook-ledger rows, support-log pruning, and optional image-job retention cleanup).
- Keep `NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE` configured so only failures are logged.
- Schedule `/api/cron/cms-automation-errors-retention` daily to archive stale error-log rows and prevent database bloat.
- Schedule `/api/cron/content-calendar-seeding` weekly to seed new `Planned` entries in the Content Calendar.

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

# Maintenance

## Routine Checks

- Keep dependencies patched (`npm audit`, selective upgrades).
- Rebuild and verify API routes after Next.js minor upgrades.
- Ensure Markdown/code-block rendering still works after remark/rehype updates.
- If local hooks stop running, re-run `npm run prepare` to restore Husky hook wiring.

## Content Hygiene

- Keep article slugs stable after publish.
- Validate dates and `Topics/Tags` values for consistency.
- Keep `SEO Title` and `SEO Description` populated and within SOP target ranges
  before publish-safe statuses.
- Keep `Content Pillar` populated (`Mindset`, `Software`, `Design`, `Leadership`, `Product Execution`) so brand coverage stays balanced.
- Keep `Tech` values tool/framework specific (avoid concept tags like `Design` or `Observability` in `Tech`).
- Confirm `Search Index` is being populated on `Portfolio CMS - Articles` after projection sync runs.
- Confirm projection sync propagates source `SEO Title` and `SEO Description`
  into `Portfolio CMS - Articles` after SEO edits.
- Run `/api/cms/sync/articles/prepublish-gate` as part of release checks to
  catch SEO metadata, date, and publish-safe status blockers early.
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

## Hermes Security Controls

- Public endpoint kill switches:
  - Set `HERMES_DISABLE_CHAT=true` to disable `/api/openai/chat`.
  - Set `HERMES_DISABLE_IMAGE=true` to disable `/api/openai/image`.
- Tune abuse/cost limits per environment:
  - `HERMES_CHAT_RATE_LIMIT_PER_MINUTE`
  - `HERMES_IMAGE_RATE_LIMIT_PER_MINUTE`
  - `HERMES_MAX_MESSAGE_CHARS`
  - `HERMES_MAX_MESSAGES`
  - `HERMES_MAX_COMPLETION_TOKENS`
  - `HERMES_IMAGE_DAILY_LIMIT`
  - `HERMES_GUARDRAILS_MAX_BUCKETS` (optional in-memory bucket cap)
  - `HERMES_GUARDRAILS_BUCKET_TTL_MS` (optional stale-bucket TTL)
- Optional bot challenge:
  - Configure `TURNSTILE_SECRET_KEY` to enforce server-side Turnstile verification for Hermes chat/image requests.
- Incident response playbook (public abuse or cost spike):
  1. Immediately set `HERMES_DISABLE_IMAGE=true` (highest-cost path) and redeploy.
  2. If abuse continues, set `HERMES_DISABLE_CHAT=true` and redeploy.
  3. Lower rate limits and caps (`HERMES_*`) before re-enabling.
  4. Confirm routes return expected guardrail responses (`429`/`403`) in production logs.
  5. Re-enable chat first, image second, while monitoring request volume and spend.

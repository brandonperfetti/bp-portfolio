# Maintenance

## Recurring

- **Payload upgrades**: bump `payload` + every `@payloadcms/*` to the same
  version in one commit; run `pnpm generate:types` + `pnpm generate:importmap`;
  run migrations locally; smoke the admin (editor renders a migrated post,
  SEO tab populated) before pushing.
- **Next/React upgrades**: majors are deliberate events; check Payload's
  supported Next range first (Payload pins minimums).
- **GitHub tech-signal token**: fine-grained PAT (Contents: read) expires on
  the schedule chosen at creation — rotate in Vercel env
  (`GITHUB_TOKEN`). Scan knobs: `GITHUB_TECH_*` in `.env.example`.
- **Neon/Blob**: staging DB is the Neon store; production gets its own at
  promotion. Blob store `bp-portfolio-media` is public-read.
- **Storybook**: keep stories in sync with component changes (CI builds
  storybook, so breakage fails fast).

## Watchpoints

- Stale generated artifacts are the classic admin breakage (empty SEO tab /
  dead editor) — CI gates both, but check first when admin misbehaves.
- Lexical error #17 on articles ⇒ an editor feature for a migrated node type
  was removed (docs/PAYLOAD.md).
- Husky pre-push failing on `.next` types ⇒ remove `.next`, retry.
- pnpm "ignored builds" errors ⇒ `allowBuilds` in `pnpm-workspace.yaml`.

## Promotion checklist (v4 → production, when signed off)

1. Merge `rebuild/v4` per branch plan; retarget staging env to `develop`.
2. Create production Neon DB + Blob token; set all `.env.example` production
   vars in Vercel (Payload, Clerk, AI, Upstash, SendGrid, GitHub signals).
3. Delete legacy v3 vars: all `NOTION_*`, Cloudinary vars, `CRON_SECRET`,
   Notion webhook secrets — only at promotion, not before.
4. Run migration against production DB; verify `/articles/[slug]` URLs and
   redirects; publish pass in admin.
5. Point brandonperfetti.com at the v4 production deployment; keep the v3
   rollback path documented until stable.

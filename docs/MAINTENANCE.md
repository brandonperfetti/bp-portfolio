# Maintenance

## Routine Checks

- Keep dependencies patched (`npm audit`, selective upgrades).
- Rebuild and verify API routes after Next.js minor upgrades.
- Ensure MDX parsing still works after remark/rehype updates.

## Content Hygiene

- Keep article slugs stable after publish.
- Validate dates and category titles for consistency.
- Confirm search index quality when adding new content formats.

## Integration Hygiene

- Rotate API tokens periodically (SendGrid, OpenAI, GitHub PATs).
- Re-validate SendGrid permissions/scopes when subscription flow changes.
- Verify `NEXT_PUBLIC_SITE_URL` for each environment before release.

## Known Operational Notes

- Home-page newsletter card is intentionally hidden temporarily, but mailing list API route remains available.
- Hermes route intentionally suppresses footer to minimize outer scroll and keep chat UX focused.

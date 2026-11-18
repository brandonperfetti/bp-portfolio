# Changelog

What each production release of brandonperfetti.com changed, newest first.
Each entry is written for someone deciding whether the release affects them:
a visitor, the CMS admin, an external MCP client, or a developer on this
repository. An audience a release does not reach is left out of its entry.

Versions are dates: `vYYYY.MM.DD`, the Pacific-time date the release PR was
merged into `master`; a later release on the same day adds `.1`, then `.2`.
Each version is an annotated tag on that release's merge commit.
`package.json` stays at `4.0.0`. Releases before `v2026.11.17` are not listed
here; each one's release PR body is its record. How an entry is written and
when the tag is made: [`docs/WORKFLOW.md` § Releases](docs/WORKFLOW.md#releases).

## v2026.11.17

Access control in the three CMS global readers, cached reads that follow a
page's publish state, and developer hygiene. Release PR
[#357](https://github.com/brandonperfetti/bp-portfolio/pull/357) ·
[tag](https://github.com/brandonperfetti/bp-portfolio/releases/tag/v2026.11.17) ·
carries #349, #351, #352, #354, #355 and #358.

**Visitors**

- **Security:** the navigation, site-settings and cookie-consent readers
  enforce access control. A privacy-policy relation that points at a
  never-published page is no longer populated, so the consent dialog shows no
  link to it (#262). On production nothing visible changed: no privacy
  relation was set.
- **Caching:** after a page is published, unpublished or deleted, the consent
  dialog's link to it, links to it inside an article's layout blocks, and
  redirects that target it follow within seconds instead of up to six hours
  (#358).

**The CMS admin**

- The Slug field's help text now says that only the admin form re-derives a
  slug before first publish; an API or MCP write that omits `slug` keeps the
  stored one (#263).
- Payload usage telemetry is off in every environment (#331).
- No collection, global or field changes shape; there is no migration.

**MCP clients**

- The `slug` property's description in the tool schema changes. Clients that
  cache tool schemas see new text only; no parameter changes.

**Developers**

- The dependency override rule and its table of four standing pin crossings
  (#349, #352).
- `@storybook/addon-mcp` 10.6.7, with the global `valibot` override dropped
  (#351).
- Postgres-tier fixtures scoped to their own rows (#354).
- `agentRules: false` for `next dev`, a pre-push hook that skips
  deletion-only pushes, hermetic Corvus unit tests, and docs corrections
  (#355).

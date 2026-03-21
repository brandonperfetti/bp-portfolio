# Agent Notion Operations

## Purpose

Agent-facing playbook for working with Notion-backed CMS workflows in BP Portfolio using Notion MCP, Cloudinary MCP, and Codex image tooling.

Use this document for operational execution. Use `docs/notion-integration.md` for runtime architecture details.

## Tooling Roles

### Notion MCP

Use for:

- Reading/writing CMS records and SOP pages.
- Inspecting data source schemas before updates.
- Moving/reorganizing pages/databases.
- Logging operations evidence.

Primary expectation:

- Always fetch schema/context first, then write.

### Cloudinary MCP

Use for:

- Managing asset metadata/tags/folders.
- Asset inventory/search and lifecycle cleanup.
- Administrative operations that should not be done via ad-hoc URL edits.

Primary expectation:

- Treat Cloudinary as the media system of record for assets, but keep article/content truth in Notion source records.

### Codex Image Skill (`$imagegen`)

Use for:

- Generating/editing image candidates (for covers or visual assets) via OpenAI image APIs.

Primary expectation:

- Generation is not publication. Persist winning assets and metadata back through the approved Notion/Cloudinary workflow.

## Canonical Data Rules

1. Source content data source owns article authoring/editorial truth.
2. `Portfolio CMS - Articles` is projection/read-model output.
3. `Source Article` page blocks are canonical article body source.
4. Do not manually force publish state by editing projection records.
5. Keep Notion API version pinned to `NOTION_API_VERSION=2025-09-03`.

## Standard Agent Workflow

1. Identify the operation type.

- Content/source edit, projection maintenance, governance doc update, or asset workflow.

2. Read before write.

- Fetch target page/data source.
- Confirm schema and required fields.
- Confirm whether target is canonical or derived.

3. Apply minimal scoped changes.

- Prefer single-record/single-page edits when possible.
- Avoid broad destructive operations.

4. Verify immediately.

- Re-fetch changed pages/rows.
- Confirm expected fields, status, and relations.

5. Log when operational.

- For reconciliation/drift/cleanup/integrity activities, log evidence in Notion `Operations Runs`.

## Playbooks

### A) Update a canonical CMS record

1. Fetch target data source schema.
2. Locate the row (by title/slug/id).
3. Update only canonical fields.
4. Re-fetch and confirm persisted values.
5. If projection-dependent, trigger sync endpoint or wait for webhook sync and verify.

### B) Article projection maintenance

1. Treat source content row as the only publish-control plane.
2. Use `/api/cms/sync/articles` or reconciliation endpoints for projection fixes.
3. Never use projection row manual edits as a substitute for source fixes.
4. Confirm `Source Article` relation and mapped fields after sync.

### C) Governance and SOP operations

1. Use `Governance Hub` as the canonical governance index.
2. Keep SOP run evidence in `Operations Runs`.
3. Prefer moving artifacts to the right container over duplicating docs.

### D) Cover/image workflow (agentic)

1. Generate candidates with `$imagegen` only when needed.
2. Upload/store winning assets in Cloudinary with policy-aligned foldering/tags.
3. Persist final asset URL/selection fields in source Notion records.
4. Run projection sync if the updated metadata should appear in delivery surfaces.
5. Log operational runs or exceptions in `Operations Runs`.

## Guardrails

- Do not overwrite canonical article body in projection structures.
- Do not rewrite unrelated SOP content while performing operational edits.
- Do not delete child pages/databases during Notion `replace_content` actions unless explicitly approved.
- When Notion validation errors list child-content deletion risk, stop and switch to targeted `update_content` edits.
- Prefer explicit dates and status values when writing operational logs.

## Suggested Run Log Minimum (Operations Runs)

For each operational run, capture:

- `Run` (title)
- `Run Type`
- `Run Date`
- `Status`
- `Source Asset` (URL to report/SOP/run page)
- `Notes` (brief outcome and follow-up)

## Related References

- Runtime architecture: `docs/notion-integration.md`
- Setup + endpoint runbook: `docs/NOTION_CMS.md`
- Project-wide rules: `AGENTS.md`

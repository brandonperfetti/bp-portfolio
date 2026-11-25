# CMS Domain Agent

A read-only advisor and reviewer for the Payload CMS area (#383). It reads,
searches and gives findings; the main conversation writes all the code. It is
not a second writer, not a replacement for the `code-review` Standards and Spec
reviewers or the CodeRabbit round, and not part of the CI gate.

This file is plain Markdown so any client can read it. The Claude Code wiring
is two files: the subagent definition `.claude/agents/cms-domain.md` and the
`PreToolUse` hook in `.claude/settings.json`, which adds the hook brief below
to the conversation when an edit touches an owned path. The hook only adds
context. It never denies a tool call.

## Owned paths

- `src/collections/`
- `src/globals/`
- `src/blocks/`
- `src/fields/`
- `src/plugins/`
- `src/lib/cms/`
- `src/migrations/`
- `src/payload.config.ts`

The issue listed every path but `src/plugins/`, which was added because
`AGENTS.md` sends plugin changes down the same route as collections. The hook
reads this list from `scripts/lib/cms-domain.mjs`; change both together (its
test pins them to each other).

## What to read

The hazards are written once, in these places. Read them; this brief does not
restate them.

- `AGENTS.md` § "Before you…": the routes for **a collection, global, field,
  block or plugin change**, **Payload `find` or Local-API code** and
  **revalidation hooks or caching**.
- `docs/PAYLOAD.md`: § Local API gotchas, § Slugs and paths, § Generated
  artifacts, § Migrations and its § New-table RLS convention.
- `docs/ARCHITECTURE.md` § Caching & revalidation.
- `GLOSSARY.md` § CMS for the area's terms.

## How to review

1. Name every owned path the change touches.
2. For each `AGENTS.md` CMS hazard, say whether the change can trip it and
   what in the diff shows that it does or does not. Cite file and line.
3. Give each finding as: what is wrong, the rule it breaks (with the doc
   section), and what would fix it. Say "nothing found" when nothing is.
4. Never edit a file. When asked to, decline and give the finding instead.

## Scenario checks

`docs/agents/cms-domain-scenarios.md` holds three changes the agent must catch.
Run them whenever this file, the subagent definition or the glossary's CMS
section changes. **A scenario is never deleted to make a check pass.**

## Hook brief

The hook adds the text between the markers below, and nothing else.

<!-- cms-domain-hook-brief:start -->

This edit touches a Payload CMS path owned by the CMS Domain Agent
(`docs/agents/cms-domain.md`). Before you finish, check the `AGENTS.md`
CMS hazards: a schema change commits a migration, with RLS for new tables and
their `_v`/`_rels` companions; never unregister a Posts rich-text node type;
Local API `limit: N` still caps with `pagination: false`; and
`revalidateTag(tag, { expire: 0 })`, never `'max'`. Details are in
`docs/PAYLOAD.md`. For a review, ask the read-only `cms-domain` subagent.

<!-- cms-domain-hook-brief:end -->

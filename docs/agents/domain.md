# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo is **single-context**: one `CONTEXT.md` at the repo root and one `docs/adr/` directory,
neither of which exists yet — see "Where they would live" below.

### The `pnpm-workspace.yaml` here is not a monorepo signal

The setup skill lists `pnpm-workspace.yaml` as a monorepo signal. This repo has one, and it is a
**false positive**. pnpm 11 reads its settings from `pnpm-workspace.yaml` rather than from
`package.json`, so the file exists here purely to hold `overrides`, `allowBuilds` and
`minimumReleaseAgeExclude`. Its `packages:` list is `['.']` — the repo root itself, not a set of
sub-packages.

The three checks that actually settle it, all negative:

- no `workspaces` field in `package.json`
- no `packages/` directory
- exactly one `package.json` in the tree (the root one)

So a re-run of the setup skill should stay **single-context**. Do not flip this to multi-context on
the strength of the workspace file alone; re-run the three checks above first.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists: it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## Where they would live

```
/
├── CONTEXT.md                         ← glossary (does not exist yet)
├── docs/
│   ├── adr/                           ← ADRs (does not exist yet)
│   │   └── 0001-<slug>.md
│   ├── agents/                        ← this directory
│   └── ARCHITECTURE.md, AI.md, …      ← the existing subject-matter docs
└── src/
```

Note the neighbours: `docs/` already carries a set of subject-matter documents indexed from
`.github/copilot-instructions.md` under "Progressive disclosure". `CONTEXT.md` is not one of those
— it is a glossary of domain terms, and it belongs at the repo root, not in `docs/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

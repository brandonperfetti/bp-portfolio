<!-- template-baseline: intent-first/1 -->
<!--
Fill what applies. A routine change needs only a few lines: Intent with its Door and
Cleanup, Changes and Verification. Delete an optional section rather than writing
"N/A". Link full gate and review receipts instead of pasting them.
-->

## Intent

<!-- Who benefits, and what becomes possible or better. One or two sentences. -->

**Door:** <!-- two-way or one-way, and why; the recovery or migration consequence -->
**Class:** <!-- composes | extends | one-way door; choose one and explain why -->
<!--
Class adds evidence; it never lowers the working agreements' requirements. A4
independent review always runs. If a requirement feels excessive, record it in
_agent/friction; do not amend the requirement or the agreements.

List the chosen class's evidence below, saying for each item whether it was
captured from the real build:
- composes — copy, styles, docs, a new test, or use of existing capabilities:
  full A5 gate; before/after evidence when the change is visual.
- extends — changes to existing behavior (routes, components, search, auth,
  webhooks): full gate; a test exercising the changed behavior; the matching
  docs/JOURNEYS.md journey run against a real build; a separate reviewer.
- one-way door — Payload schemas or migrations, RLS, production CMS writes
  through Kody, deleting data, env or hosting changes, or money: all evidence
  above; migration up and down on a branch database with row counts; a
  rollback plan actually tried; Brandon's explicit sign-off before merge.
-->

**Cleanup:** <!-- none, done or needed; what remains and when it can be removed -->

## Why

<!--
The evidence or constraint behind this change; the consequential alternative, if one
was set aside.
-->

## Changes

<!--
The few behavior or system changes a reviewer needs to understand, with any
compatibility, security or data consequence.
-->

-

## Verification

<!--
What actually ran or was inspected, and on which revision or environment when that
matters; the result; what is still unproven.
-->

-

## References

<!--
The governing brief or spec, and related issues and decisions, using this repository's
issue-closing rules.
-->

-

<!--
Optional. Uncomment only when prose is not enough.

## System changes

A compact before/after flow or the affected parts of the system, or representative UI
states and screenshots that show no private data.
-->

<!-- local: bp-portfolio -->

## BP checks

<!--
Delete the lines that do not apply. Sources: AGENTS.md, docs/WORKFLOW.md,
docs/TESTING.md, PRs #303/#304 for issue closing.
-->

- Base is `develop`. An issue this PR completes gets `Closes #n` (it fires only
  when the release reaches `master`; the release PR repeats it); anything else
  is `Refs #n`.
- Payload schema change: migration `src/migrations/<name>` committed, with RLS
  for any new table, and generated types/importMap regenerated.
- Hooks, page hierarchy, redirects or the embeddings store: the pg integration
  tier ran (`pnpm exec vitest run --root evals`).
- Corvus or eval-adjacent: a keyed `pnpm eval:ci` ran before push.
- No test accompanies this behavior change because:
- Journey proof: which `docs/JOURNEYS.md` rows this run proved, and which
  specs skipped.

<!-- /local -->

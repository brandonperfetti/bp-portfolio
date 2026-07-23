# Documentation standards

## TSDoc (enforced)

- Every exported function, React component, hook, Payload
  collection/field/hook, and non-obvious utility carries a TSDoc comment:
  intent first, then params/returns where non-trivial, `@remarks` for
  gotchas and rationale.
- `eslint-plugin-tsdoc` validates syntax in CI (warnings today — keep them
  at zero-error and trend warnings down).
- Document **why**, not what: tradeoffs, invariants, failure modes,
  cross-file contracts (e.g. "repoCount reads as at-least-N").

## Inline comments

- Comment non-obvious logic, edge cases, and workarounds — especially
  environment quirks (bridge, Vercel, pnpm) future readers can't infer.
- No narration of obvious code. Update comments in the same change that
  alters behavior.

## docs/*.md

- Progressive disclosure: the top-level agent instructions
  (`.github/copilot-instructions.md`, symlinked as `CLAUDE.md`/`AGENTS.md`)
  stay thin — invariants + index. Depth lives here in `docs/`.
- Each doc is a map, not a mirror: point at source files rather than
  duplicating them; record contracts and reasons that code can't express.
- When a change invalidates a doc statement, update the doc in the same PR.

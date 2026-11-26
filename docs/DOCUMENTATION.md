# Documentation standards

## TSDoc

The standard has two halves, and only one of them is a gate.

**Enforced: syntax.** `eslint-plugin-tsdoc`'s `tsdoc/syntax` rule checks
every doc comment that exists in a `.ts`/`.tsx` file. The rule stays severity
`warn` so `eslint --fix` at commit time doesn't block a work-in-progress doc
comment, but `pnpm lint` runs `--max-warnings=0`, so any tsdoc warning fails
pre-push and CI. Fix the comment; don't suppress it.

**Convention: presence.** Every exported function, React component, hook,
Payload collection/field/hook, and non-obvious utility carries a TSDoc
comment: intent first, then params/returns where non-trivial, `@remarks` for
gotchas and rationale. No rule checks this. An export with no doc comment
gives the syntax rule nothing to validate, so it passes lint, pre-push and CI.
Review holds this half (#240).

Whatever the comment says, document **why**, not what: tradeoffs,
invariants, failure modes, cross-file contracts (e.g. "repoCount reads as
at-least-N").

**Relationship to sans-faux-studios.** sans-faux-studios adopts this
standard and adds a lint rule that fails on an exported symbol with no doc
comment
([brandonperfetti/sans-faux-studios#41](https://github.com/brandonperfetti/sans-faux-studios/issues/41)),
so it enforces both halves where this repo enforces syntax only. Its rule
shipped in
[sans-faux-studios#53](https://github.com/brandonperfetti/sans-faux-studios/pull/53):
`jsdoc/require-jsdoc` scoped to exported declarations, `jsdoc/require-description`,
and a ban on `export *`, which the presence rule cannot see. Once that rule is
proven on its tree, the cost of adopting it here is measured and presence
enforcement is reconsidered on that measurement (#240).

## Inline comments

- Comment non-obvious logic, edge cases, and workarounds — especially
  environment quirks (bridge, Vercel, pnpm) future readers can't infer.
- No narration of obvious code. Update comments in the same change that
  alters behavior.

## docs/*.md

- Progressive disclosure: the top-level agent instructions
  (`AGENTS.md`, the canonical file; `CLAUDE.md` imports it via `@AGENTS.md`
  and `.github/copilot-instructions.md` is a symlink to it) stay thin —
  product purpose, the invariants that hold for every change, the gate route
  and **Before you…** task triggers. Depth lives here in `docs/`.
- **What earns a line in `AGENTS.md`.** A boundary that applies to every
  change stays under Invariants. A hazard that bites only one kind of work
  goes in that work's **Before you…** trigger, named in bold so it is seen
  before the work starts, with its mechanism in the owning doc. Do not add a
  doc to `docs/` without a trigger that routes to it.
- The local CI gate lives in one place: `docs/TESTING.md` § Local CI gate.
  `AGENTS.md` § "CI gate" points there (the agent-docs profile accepts a
  linked gate); run it from there and don't copy its commands into other
  docs. `.github/workflows/ci.yml` is authoritative for CI — the section
  mirrors only its `quality` job. When a change adds, removes, or reorders a
  step in that job, update the mirror in the same PR.
- Who owns what:
  - `docs/PRODUCT.md` — who the site is for, principles for recurring
    judgments, and settled decisions with their revisit conditions. Strategy
    the owner has not settled is listed as open there, not invented.
  - `docs/ARCHITECTURE.md` — the capability map (where things live in code).
  - `docs/FEATURES.md` — what each surface does and why it behaves that way.
  - `docs/JOURNEYS.md` — reader/editor journeys and the tests that prove
    them, including what is _not_ proven (content-dependent skips).
  - `docs/TESTING.md` — test layers, the local gate, and the owned-instance
    journey recipe. `scripts/verify-reader-journeys.ts` owns the executable
    reader-lab lifecycle; link its invocation here rather than copying its
    setup commands into client-specific skills.
- Each doc is a map, not a mirror: point at source files rather than
  duplicating them; record contracts and reasons that code can't express.
- When a change invalidates a doc statement, update the doc in the same PR.

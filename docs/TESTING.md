# Testing

## Layers

- **Unit/component** — Vitest + Testing Library (jsdom), the `unit`
  project (`pnpm test` = `vitest run --project=unit`). Co-located
  `*.test.ts(x)`. Pattern reference: `ArticlesExplorer.test.tsx` (next/*
  mocks), `TechCard.test.tsx` (aria-expanded toggle), `canAccess.test.ts`.
- **E2E** — Playwright (`e2e/`), production server in CI
  (`pnpm test:e2e`). Sandboxed runners can pin the browser via
  `PLAYWRIGHT_EXECUTABLE_PATH`. Conditional skips guard content-dependent
  specs (e.g. empty article DB).
- **Storybook** — `pnpm build-storybook` is a CI gate (story breakage);
  a11y addon fails stories on serious violations. That gate is
  **compile-only**, though: it proves a story module builds, not that it
  renders or that its `play` asserted anything. What catches a render failure
  is `pnpm test:storybook` (browser-mode Vitest, real Chromium) or loading a
  story id from a served `storybook-static` — the runner loads
  `.storybook/main.ts` via `storybookTest({ configDir })`, so canvas and runner
  share one vite config on purpose, and #162 is what happens when they diverge
  (a `define: { __dirname }` only `vitest.config.ts` carried; eight
  `AI/CorvusChat` stories threw in the canvas while the runner stayed green).
  Any bundler-level setting added to one config belongs in both. Deliberately
  **no separate Playwright canvas smoke gate** (#162): with the configs
  converged the browser-mode tier already mounts every story in a real browser,
  so a second harness would only re-test that and add a browser download to CI.
  **Interaction tests**:
  `@storybook/addon-vitest` runs every story as a Vitest browser-mode test
  (Playwright Chromium) — the `storybook` project, `pnpm test:storybook`.
  `play` functions are the interactions (composer typing/refocus, FAQ
  accordion, link resolution). Notes: preview sets
  `nextjs.appDirectory: true` (next/navigation mocks need it or
  `useRouter` throws), the project's alias array stubs the server blocks
  before `@/` resolves (mirrors `.storybook/main.ts` viteFinal), and
  sandboxes pin the browser via `PLAYWRIGHT_EXECUTABLE_PATH`
  (`PLAYWRIGHT_EXECUTABLE_PATH=/path/to/chromium pnpm test:storybook`, plus an
  optional story path to narrow the run — never run `playwright install` in a
  sandbox).
- **Payload pipeline integration** — `evals/*.test.ts` also hosts tests that
  need a REAL Payload on a REAL Postgres (the `e2e` job's `pgvector/pgvector:pg16`
  service plus `pnpm migrate`); run by `pnpm exec vitest run --root evals`.
  `slug-redirect-integration.test.ts` is the reference: it drives the actual
  update/versions/drafts pipeline. **Mock `payload.find` at your peril** — #120
  shipped a broken hook twice because the mocked unit tier could not reproduce
  Payload's `req.context` swap on nested Local API calls. Anything that depends
  on hook plumbing rather than its own branching belongs here.
  **Fixtures in this tier are enforced, not conventional (#191).** Its files run
  in parallel Vitest workers against ONE database, so every cross-file assertion
  separates real corpus rows from fixtures by the `zz-` slug prefix alone; write
  every `posts`/`pages` fixture through `evals/fixtures/payload-fixtures.ts`,
  which throws on an unprefixed slug, and get the shared `/articles` archive
  anchor from `evals/fixtures/articles-anchor.ts`, which creates it at most once
  and never deletes it — a file that creates and deletes that singleton itself
  decides, from a parallel worker, whether a sibling file's collision case
  asserts anything at all. `scripts/eval-harness.test.ts` fails the build on a
  direct `payload.create`, a reused fixture marker, and a test file that names
  the anchor slug.
- **Evals** — Evalite for Corvus, run from the `evals/` root and **gating** as
  of #82; `evals/*.test.ts` run in `e2e` via `vitest run --root evals`, not in
  `pnpm test` (see `docs/AI.md` §Evals).

### Asserting CSS state (`:hover`, `:focus-visible`) in a play function

`userEvent` from `storybook/test` dispatches **synthetic** pointer events. They
drive React handlers correctly, but they never move the browser's own pointer,
so the element does not enter CSS `:hover` and a `…:hover { }` rule never
matches — a story that reads `getComputedStyle()` after `userEvent.hover()`
silently measures the resting style. Only `vitest/browser`'s `userEvent` has a
real (Playwright) pointer, and it exists **only under `pnpm test:storybook`**:
`vitest/browser` resolves to a module that throws at import outside the runner,
so it must be loaded lazily and never imported statically — a static import
kills the whole story module in `pnpm storybook` and, because rolldown
tree-shakes the throw and folds the export to `null`, ships `null.hover(…)`
into the built canvas while `pnpm build-storybook` stays green. **That gate
cannot see this class of breakage**; grep the built chunk, or import the story
module in a running canvas, to check. Gate the lazy import on
`typeof import.meta.env.VITEST_STORYBOOK !== 'undefined'` — a build-time flag
simple enough for rolldown to fold, so the canvas drops the import entirely.
**Do not gate on `import.meta.env.VITEST`: it is undefined in browser mode**
(Vitest sets `process.env.VITEST` in Node only), and it silently skipped every
CSS-state assertion while the suite still reported 7/7. Separately, decide
"are we in the runner _now_?" with `globalThis.__vitest_browser_runner__`.
Then **fail closed**: if the runner marker is present but no real pointer was
obtained, throw — a story must never report green under the runner without
having engaged `:hover`. The `console.warn`-and-skip path is for the canvas
only, and assertions that need no pointer (focus outline, resting fill) stay on
both paths. `CorvusChat.stories.tsx` is the reference — see the `@remarks` on
its `getRealUserEvent()`. **When you rely on a skip path, grep the run output
for the skip string and expect zero hits**; a green run alone does not prove
the assertions ran. Two
corollaries: assert transitioned properties through `waitFor` rather than a
single sample (a `transition: box-shadow 150ms` reads its start value on the
frame the pointer lands), and never let a negative assertion be the only one in
a hover story — prove the state engaged first. Note also that `tab()` from
`storybook/test` is synthetic: whether it lands as `:focus-visible` rides on
Chromium's last-interaction heuristic (a real pointer _press_ resets it; a
hover does not), so assert `matches(':focus-visible')` rather than assuming it.

## Local CI gate

A local mirror of the `quality` job ("Lint · Types · Unit") in
`.github/workflows/ci.yml` — and only that job. Run it as a bash script (not
pasted into an interactive shell) before calling a change done; it stops at the
first failing step:

```sh
set -euo pipefail
export PAYLOAD_SECRET=ci-not-a-real-secret
export NEXT_PUBLIC_SITE_URL=http://localhost:3000
export NEXT_PUBLIC_SITE_NAME='BP Portfolio (CI)'
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm generate:types
pnpm exec prettier --write src/payload-types.ts
git diff --quiet -- src/payload-types.ts
pnpm generate:importmap
pnpm exec prettier --write "src/app/(payload)/admin/importMap.js"
node scripts/check-importmap.mjs
git diff --quiet -- "src/app/(payload)/admin/importMap.js"
pnpm payload migrate:create --skip-empty < /dev/null
test -z "$(git status --porcelain -- src/migrations/)" # untracked files count
node scripts/check-migrations-rls.mjs
pnpm test:coverage
pnpm build-storybook
```

The "Build · E2E" and "Evalite (Corvus)" jobs are not mirrored here; they need
Postgres, Playwright or provider keys and remain gated by PR CI. A green gate
says nothing about whether a user journey works — that is
§ Verifying a journey locally below.

## CI (`.github/workflows/ci.yml`)

Quality job: lint (ESLint + tsdoc) → prettier check → typecheck → generated
payload-types staleness gate → generated importMap staleness **and
plausibility** gate (`scripts/check-importmap.mjs`, #131 — staleness alone
cannot see an empty map, because empty regenerated as empty is not stale; it
runs between the regenerate and the diff so it judges freshly generated
content) → committed-migration gate (#116) → new-table RLS gate
(`scripts/check-migrations-rls.mjs`, #117) → unit tests + coverage → Storybook
build. E2E job: pgvector/pg16 service,
migrations, production build, Playwright e2e, then Storybook interaction
tests (reuses the job's installed Chromium). Evalite job runs when a
provider key secret is present.

## Running e2e locally (the only trustworthy local signal)

`playwright.config.ts` branches on `CI`. Reproduce what CI actually runs:

```bash
pnpm seed:e2e                 # deterministic content the specs assert on
pnpm build                    # the `isCi` branch serves `pnpm start`, not `pnpm dev`
CI=1 pnpm test:e2e            # forbidOnly, retries: 2, workers: 1, production server
```

Under `CI=1` the config's `webServer.command` is `pnpm start` and
`reuseExistingServer` is false, so the suite gets a freshly booted production
build — the same shape as the `Build · E2E` job. **Run it this way before
believing a local result.**

Without `CI`, `webServer.command` is `pnpm dev`, and dev-mode e2e keeps the
seed/hydration flakiness the wave-1 work ran into: specs race the dev server's
on-demand compilation and hydration, and an unseeded or half-seeded database
turns content assertions into coin flips. A green dev-mode run is not evidence
that the suite passes; a red one is not evidence that it fails.

Two related notes:

- The suite drives the app at `http://127.0.0.1:3000` (`use.baseURL`). Next
  blocks cross-origin requests to its dev-only `/_next` and `/__nextjs`
  endpoints, and its built-in allowlist covers only `localhost`, so
  `next.config.mjs` carries `allowedDevOrigins: ['127.0.0.1']` (#119). The key
  is dev-only — it has no effect on `next build` / `next start`, which is what
  `CI=1` uses.
- **Home sticky rail** — if the home rail does not stick, check the DATA
  before the code. Sticky is a per-column CHECKBOX on the Column block
  (`src/blocks/Column/config.ts`, `sticky`, label "Stick to the top while
  scrolling", `defaultValue: false`), and it only applies from the `lg`
  breakpoint up. The one-line check: open Pages → `home` in the admin and
  confirm that checkbox is ticked on the rail column. Unticked is a content
  edit, not a bug — no code change will fix it.

## Verifying a journey locally

The project-owned reader lab runs the two bold reader journeys in
[JOURNEYS.md](JOURNEYS.md) against an isolated, seeded production build:
article search → read → Back/reload, and command palette → exact article/body
→ real clipboard (light and dark). Its implementation is
`scripts/verify-reader-journeys.ts`; its invocation is `pnpm verify:readers`.
Use this recipe from the checkout root. It is a focused acceptance run,
not the full Build · E2E job, pg tier, Evalite or Storybook interactions.
After a Next or Storybook bump, `pnpm test:storybook` remains a separate
check: building Storybook alone does not exercise its stories.

### Prepare and identify the instance

Prerequisites: Node 24 from `.nvmrc` (the helper uses native TypeScript
execution), existing pnpm dependencies, Docker running with `pgvector/pgvector:pg16` already available,
`git`, `ps`, `lsof`, `unzip`, and an existing Chromium executable compatible with the
installed Playwright. The helper installs nothing. Use Playwright's installed
browser or a cached Chromium headless shell; a cached browser is not CI's
managed browser. The existing seed reads public Cloudinary images.

Select a **new absolute evidence directory** beneath an existing approved
private artifact directory, outside this checkout, and the actual browser
path. The shell variables below are your selected paths, not defaults:

```sh
pnpm verify:readers prepare --run "$READER_RUN" --browser "$READER_BROWSER"
pnpm verify:readers doctor --run "$READER_RUN"
```

`prepare` refuses occupied loopback ports 3000/55432, missing dependencies,
pre-existing `media/`, and another lab's checkout lock. It preserves an
existing `.next/` by moving it to `original.next` in the run directory and
restores it during cleanup. Do not edit source, change environment files,
run another build/gate, or drive the same instance concurrently. The helper
locks the checkout and serializes doctor/drive/cleanup operations; that lock
is a coordination control, not protection against another shell ignoring it.
Existing `test-results/` and `playwright-report/` are not used or replaced.

The lab pins a local Unix-socket Docker endpoint and daemon identity before
creating resources. Remote/ambiguous endpoint selection fails; later context
changes cannot redirect its commands. Doctor and cleanup refuse a changed
daemon rather than treating an absent container on another daemon as cleaned.
The lab creates a uniquely labeled disposable Postgres container with tmpfs
data, never the compose database or a production restore. It pins all active
and commented names in `.env.example` to empty, then supplies only its local
DB/site values. It does not inherit shell credentials. Both real Next and
Payload environment loaders must leave no unexpected nonempty names in
both modes, including Payload's parent fallback, before migration/seed/build.
Unexpected names fail with names only; do not copy secret values into logs.
Fix environment documentation through its normal scope before retrying.

`doctor` checks the current source snapshot, environment-file identities,
browser, build ID/directory, labeled container and loopback binding, owning
server PID/start time/listener, and required seeded posts/search results.
A listening server alone is not ready. A changed source or build requires
cleanup and a new prepare. Keep this source and run under one trusted local
owner; this is not a sandbox for hostile code or deliberate state-file edits.

### Drive and read the proof

```sh
pnpm verify:readers drive --run "$READER_RUN"
pnpm verify:readers evidence --run "$READER_RUN"
```

Drive doctors the instance again and imports the real Playwright config into
a run-local config. It changes only lifecycle/output settings: uses the owned
server, selects the two unchanged specs, retains traces/steps and failure
screenshots outside the checkout, and disables retries. CI mode, one worker,
Chromium, reduced motion and the existing consent geo remain in effect.
A missing seed fails in CI mode; it cannot become a local skip.

Each `drive-N/` retains source identities (tracked, dirty and untracked),
ignored environment-file hashes, browser and seed identities, actual seeded
database data/hash and uploaded-file hashes, pre-drive doctor, runner exit
status/times, full JSON report and traces. `assertions.json` extracts the paired assertion
starts/ends from each trace; Playwright JSON itself omits these automatic steps. No production data belongs here.
The verdict requires the exact three case identities, successful execution
with recorded steps, zero skips/failures/flaky results/retries, and a passing
post-drive doctor. The existing palette test reads the actual clipboard and
compares the exact article URL; the wrapper does not replace that assertion.
A green total, zero tests, expected failure or skipped required case is not
proof. Read the full report/trace for assertions and any skip annotations.

For authorized interactive browser checks, use the prepared
`http://127.0.0.1:3000` instance after doctor, as the sole driver. Do not change
fixtures. Keep interactive observations separate from the codified verdict.
The evidence command also works after cleanup. Source review or one client's
successful invocation does not establish another client's capabilities.

### Cleanup and failed attempts

```sh
pnpm verify:readers cleanup --run "$READER_RUN"
pnpm verify:readers evidence --run "$READER_RUN"
```

Cleanup checks resource identities, stops only the recorded server, removes
only the labeled container and owned build/media directories, restores the
prior build, and releases the checkout lock. It retains reports, inputs,
logs and `cleanup.json`. Never delete the run directory while it holds the
original build. No kill-by-name, port takeover or force-cleanup mode exists.

A prepare failure attempts owned cleanup and retains its failure/logs. After
a drive failure, retain the evidence, clean up, diagnose, then prepare a new
run and doctor before driving again. Do not retry assertions until green.
After a killed shell/process or ownership mismatch, stop and inspect the
recorded state and any live process before recovery; do not erase a lock or
substitute identities to bypass refusal. An unresolved cleanup is an explicit
restoration task, not a successful lab. Cleanup completion does not erase an
earlier failed result.

The lab proves these navigation/clipboard mechanics on a synthetic corpus.
It does not prove reader usefulness, ranking on real content, animation,
clipboard denial/share targets, staging behavior or production health. The
other journey-map gaps remain unassessed. Helper controls are covered by
`scripts/verify-reader-journeys.test.ts`; actual end-to-end lab proof remains
separate from those unit controls.

## Policy

- Behavior change ⇒ test change in the same commit (component or e2e for UI,
  unit for logic, eval for Corvus).
- Bug fixes ship a regression test that failed before the fix.
- Motion/a11y changes validate the keyboard path and reduced-motion
  rendering.
- If no test accompanies a change, say why in the PR notes.

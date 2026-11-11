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

How to see a reader journey actually work on an instance you own, without
production data or credentials. This is what the Build · E2E job does, run
by hand; it is the recipe `docs/JOURNEYS.md` points at. Run the blocks in
**bash**, from the checkout root, in one shell.
`[measured 2026-11-11: the full suite under this recipe was 31 passed,
9 skipped (the content-dependent paths JOURNEYS.md lists), 0 failed]`

1. **Own the files and the database.** The run writes `media/` (seed
   uploads — untracked and _not_ git-ignored, never commit it),
   `test-results/`, `.next/` and, when the configured HTML reporter runs (step
   4's `--reporter` replaces it), `playwright-report/`. Record which already
   exist so cleanup touches only what this run creates. Recording a path does
   not keep its contents: the build replaces a pre-existing `.next/`,
   Playwright empties `test-results/` when it starts, and its HTML reporter
   replaces `playwright-report/` — copy out anything you need from any of
   them first. If `media/` already holds uploads you care about,
   use a fresh worktree instead. The database is
   a throwaway container on a free loopback port — not the `bp-portfolio-db`
   compose container, which holds a production restore. `--rm` with no volume
   means stopping it deletes it.

   ```sh
   PRE_EXISTING=$(ls -d media test-results playwright-report .next 2>/dev/null)
   RUN=journey-$(date +%s)
   lsof -nP -iTCP:55432 -sTCP:LISTEN && echo 'STOP: 55432 is taken; something else would answer as the database'
   docker run -d --rm --name "bp-$RUN" -p 127.0.0.1:55432:5432 \
     -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=bp_journey pgvector/pgvector:pg16 || echo 'STOP: the container did not start'
   for i in $(seq 30); do docker exec "bp-$RUN" pg_isready -q -U postgres -d bp_journey && break; sleep 1; done
   docker exec "bp-$RUN" pg_isready -U postgres -d bp_journey # must say "accepting connections"
   ```

   Go no further if a `STOP:` line printed or the last line does not say
   _accepting connections_: every later step talks to `127.0.0.1:55432`, and
   only a container this run started may be there.

2. **Control the environment.** Clearing your shell is not enough: Next
   (`@next/env` 16) and Payload's CLI (`payload migrate`, `payload run`, its
   own `@next/env` 15) both load `.env*` files from the checkout — which files
   depends on the mode, `.env.production*` only in production — and Payload's
   source also has a parent-directory fallback. A real `BLOB_READ_WRITE_TOKEN`
   there would send the seed's uploads to the real Blob store; a DSN or
   `SENTRY_SPOTLIGHT` turns on Sentry; `RESEND_API_KEY` turns on mail. Both
   loaders never overwrite a variable that is already set, even to an empty
   string, and the app treats empty as off — so pin to empty every name
   `.env.example` lists, active or commented out (that includes
   `SENTRY_SPOTLIGHT` and the `R2_*` backup credentials), plus the database
   fallbacks and the Vercel identity names, then set only the safe values:

   ```sh
   PINS=($(grep -oE '^(# ?)?[A-Z_][A-Z0-9_]*=' .env.example | sed 's/^# \{0,1\}//' | sort -u) \
     POSTGRES_URL= DATABASE_URL= VERCEL_ENV= NEXT_PUBLIC_VERCEL_ENV= VERCEL_PROJECT_PRODUCTION_URL=)
   jenv() {
     case "${NODE_ENV:-}" in '' | production) ;; *)
       echo "STOP: NODE_ENV=$NODE_ENV is not a mode the check below covers"; return 1 ;; esac
     env -i HOME="$HOME" PATH="$PATH" LANG=en_US.UTF-8 \
       CI="${CI:-}" NODE_ENV="${NODE_ENV:-}" "${PINS[@]}" \
       DATABASE_URI=postgres://postgres:postgres@127.0.0.1:55432/bp_journey \
       PAYLOAD_SECRET=ci-not-a-real-secret \
       NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 \
       NEXT_PUBLIC_SITE_NAME='BP Portfolio (journey)' \
       NEXT_TELEMETRY_DISABLED=1 \
       ${PLAYWRIGHT_EXECUTABLE_PATH:+PLAYWRIGHT_EXECUTABLE_PATH="$PLAYWRIGHT_EXECUTABLE_PATH"} \
       "$@"
   }
   # Run each loader the recipe uses, in each mode it uses, and print the
   # NAMES of every non-empty variable afterwards (never values). Expect only
   # the safe set above plus HOME, PATH, LANG, __NEXT_PROCESSED_ENV and, on
   # macOS, __CF_USER_TEXT_ENCODING — anything else came from an env file.
   for mode in '' production; do
     NODE_ENV=$mode jenv node --input-type=module -e "
       const { createRequire } = await import('node:module')
       const nextEnv = createRequire(createRequire(process.cwd() + '/').resolve('next/package.json'))('@next/env')
       const { loadEnv } = await import('./node_modules/payload/dist/bin/loadEnv.js')
       loadEnv()
       nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', { info() {}, error() {} }, true)
       console.log('mode=' + (process.env.NODE_ENV || 'dev') + ':',
         Object.keys(process.env).filter(k => process.env[k] && k !== 'NODE_ENV').sort().join(' '))"
   done
   ```

   The pins cover what `.env.example` documents. An app-read name it does not
   document is a tuning knob (`CORVUS_*`, `GITHUB_TECH_*`), not a service
   credential, as of 2026-11-11. If one appears in the check, add it to
   `.env.example` and re-run the `PINS=` line (it is read once, when it runs),
   or, for this shell only, `PINS+=(NAME=)` without re-running it — then
   repeat the check until the name is gone.

3. **Migrate, seed, build.** `jenv pnpm migrate`, `jenv pnpm seed:e2e`,
   `CI=1 jenv pnpm build`. The seed reads public Cloudinary images.

4. **Drive it.** Make sure nothing else is listening on 3000 first
   (`lsof -nP -iTCP:3000 -sTCP:LISTEN`) — Playwright and a browser would
   otherwise test whatever server is there.
   - _The codified journeys:_
     `CI=1 jenv PLAYWRIGHT_JSON_OUTPUT_NAME="${TMPDIR:-/tmp}/e2e-$RUN.json" pnpm test:e2e --reporter=list,json`
     (boots its own `pnpm start`; the JSON report, kept outside the checkout,
     is the record step 5 reads). Without a matching managed browser, point
     `PLAYWRIGHT_EXECUTABLE_PATH` at a cached Chromium headless shell under
     `~/Library/Caches/ms-playwright/` — never `playwright install` in a
     sandbox.
   - _By hand or with an agent's browser:_
     `NODE_ENV=production jenv pnpm exec next start -H 127.0.0.1 -p 3000`,
     then first check the instance is yours: `/articles` lists exactly the
     three seeded posts (`scripts/seed-e2e.ts`, `POSTS`).

5. **Record what ran, and keep it.** A skipped journey proved nothing, and
   Playwright's terminal output never shows a skip's reason — a grep of it for
   a skip string finds nothing whether the test skipped or not
   `[measured 2026-11-11, Playwright 1.61.1, with and without CI]`. Read the
   counts and every skip reason from the JSON report instead:

   ```sh
   node -e '
   const r = require(process.argv[1])
   const walk = (s) => [
     ...(s.specs ?? []).flatMap((sp) => sp.tests.filter((t) => t.status === "skipped")
       .map((t) => `${sp.file} › ${sp.title} — ${t.annotations.find((a) => a.type === "skip")?.description ?? "(no reason)"}`)),
     ...(s.suites ?? []).flatMap(walk),
   ]
   const { expected, skipped, unexpected, flaky } = r.stats
   console.log(`${expected} passed, ${skipped} skipped, ${unexpected} failed, ${flaky} flaky`)
   r.suites.flatMap(walk).forEach((l) => console.log(`skipped: ${l}`))' "${TMPDIR:-/tmp}/e2e-$RUN.json"
   ```

   The summary counts tests only: a run that never reached them (a
   `webServer` timeout, say) prints zeros, so keep step 4's exit status and
   its terminal error beside it. Copy anything you need from `test-results/`
   before cleanup or the next Playwright run.

6. **Clean up only what you made:** stop the server you started,
   `docker stop "bp-$RUN"`, then remove only the paths this run created:

   ```sh
   for d in media test-results playwright-report .next; do
     case " $(echo $PRE_EXISTING) " in *" $d "*) ;; *) rm -rf "$d" ;; esac
   done
   ```

## Policy

- Behavior change ⇒ test change in the same commit (component or e2e for UI,
  unit for logic, eval for Corvus).
- Bug fixes ship a regression test that failed before the fix.
- Motion/a11y changes validate the keyboard path and reduced-motion
  rendering.
- If no test accompanies a change, say why in the PR notes.

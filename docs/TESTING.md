# Testing

## Current State

- Automated test stack is wired:
  - `Vitest` for unit/integration tests
  - `Playwright` for browser E2E smoke coverage
- Current focused regression coverage includes Notion property parsing and publish-gate validation paths.

## Commands

- `npm run test` — run Vitest once
- `npm run test:watch` — Vitest watch mode
- `npm run test:coverage` — Vitest with V8 coverage report
- `npm run test:e2e` — Playwright E2E suite
- `npm run test:e2e:headed` — headed Playwright run

## Minimum Validation Before Merge

- `npm run lint`
- `npm run build`
- `npm run test`
- Note: lint uses ESLint flat config from `eslint.config.mjs`.
- Manual page pass:
  - `/`
  - `/articles`
  - `/hermes`
  - `/about`, `/projects`, `/tech`, `/uses`
- Motion/interaction smoke:
  - headline/scroll/hover motion renders without console/runtime errors
  - sticky desktop right rails on Home/About behave without internal rail scrollbars
  - header search modal/result transitions remain smooth and key-stable
  - Hermes empty submit re-focuses input
- API smoke checks (as relevant):
  - `/api/search`
  - `/api/openai/chat`
  - `/api/openai/image`
  - `/api/sendgrid`
  - `/api/mailinglist`
  - Hermes guardrail responses:
    - `429` on rate-limit breach
    - `403` on failed/invalid source verification
    - `403` when Turnstile verification is enabled and token is missing/invalid

## Test Update Policy

- Add/update tests whenever behavior changes, not only when files are added.
- UI interaction/state changes:
  - Prefer Playwright coverage for route-level behavior.
  - Add component tests for targeted UI logic where full E2E is unnecessary.
- Logic/data transformations:
  - Add or update Vitest unit tests close to the changed module.
- Motion/accessibility changes:
  - Validate keyboard behavior and reduced-motion parity.
- Bug fixes:
  - Add a regression test that proves the fixed behavior when practical.
- If no test is added, include explicit justification in PR testing notes.

## Coverage Priorities (Next)

- Expand Playwright flows:
  - article filtering/search query sync
  - header search modal open/close behavior
  - reduced-motion behavior parity for key routes/components
  - publish-gate happy/fail API scenarios (fixture-backed)
- Add component tests for high-change UI areas:
  - header search interactions
  - article explorer query/topic controls
  - Hermes textarea behavior (`Enter` send, `Shift+Enter` newline)
  - Hermes guardrail contract tests for chat/image API routes

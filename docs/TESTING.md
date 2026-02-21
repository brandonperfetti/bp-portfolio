# Testing

## Current State
- No automated unit/integration test suite is currently wired.
- Validation is primarily manual QA plus build/lint checks.

## Minimum Validation Before Merge
- `npm run lint`
- `npm run build`
- Note: lint uses ESLint flat config from `eslint.config.mjs`.
- Manual page pass:
  - `/`
  - `/articles`
  - `/hermes`
  - `/about`, `/projects`, `/tech`, `/uses`
- API smoke checks (as relevant):
  - `/api/search`
  - `/api/openai/chat`
  - `/api/openai/image`
  - `/api/sendgrid`
  - `/api/mailinglist`

## Suggested Next Step
Introduce Playwright smoke coverage for:
- navigation + theme toggle
- article filtering/search query sync
- header search modal open/close behavior
- Hermes send/stream happy path (with mocked API)

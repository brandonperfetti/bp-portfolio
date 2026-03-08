# Dependencies

## Core Runtime

- `next`, `react`, `react-dom`, `typescript`

## UI and Interaction

- `@headlessui/react`
- `next-themes`
- `clsx`
- `@heroicons/react`
- `gsap`
  - Purpose: reusable motion primitives (headline, reveal, parallax, hover) and interaction choreography (search modal, Hermes message entrances).
  - Accessibility: all motion must respect reduced-motion preferences through `usePrefersReducedMotion` and non-motion fallbacks.
  - Audit date: 2026-03-08.
  - Risk outcome: No findings.
  - Security/compatibility notes: no known Sonatype security flags; tightly coupled to animation timing and reduced-motion fallbacks.
  - Upgrade-risk classification: Medium (animation behavior/timing drift can affect UX polish).

## Content and Rendering

- `remark-gfm`
- `@mapbox/rehype-prism`
- `cheerio` (content parsing helpers)

## APIs and Integrations

- `openai`
- `@sendgrid/mail`
- `feed`

## Observability

- `@vercel/analytics`
  - Purpose: lightweight page and traffic analytics from Vercel with minimal integration overhead.
  - Audit date: 2026-03-08.
  - Risk outcome: No findings.
  - Security/compatibility notes: Sonatype reports no vulnerability/malicious/EOL flags at `1.6.1`; runtime impact is limited to analytics instrumentation.
  - Upgrade-risk classification: Low.
- `@vercel/speed-insights`
  - Purpose: real-user performance telemetry (web vitals + page responsiveness) to track frontend UX regressions.
  - Audit date: 2026-03-08.
  - Risk outcome: No findings.
  - Security/compatibility notes: no known Sonatype risk indicators; ensure version stays aligned with Next major upgrades.
  - Upgrade-risk classification: Low.

## Styling Toolchain

- `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/typography`
- `prettier`, `prettier-plugin-tailwindcss`
- `eslint`, `eslint-config-next`

## Testing Toolchain

- `vitest`
- `@vitest/coverage-v8`
- `jsdom`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
  - Purpose: higher-fidelity user interaction simulation (typing, clicking, keyboard flow) beyond low-level event dispatch.
  - Audit date: 2026-03-08.
  - Risk outcome: No findings.
  - Security/compatibility notes: Sonatype shows clean metadata at `14.6.1`; requires modern package exports support (compatible with current TS/Next setup).
  - Upgrade-risk classification: Low.
- `@playwright/test`

## Workflow Tooling

- `husky` (`^9.1.7`)
  - Purpose: local Git hooks to enforce pre-commit/pre-push quality checks (`format:check`, `lint`, `typecheck`, `test`) before code leaves a workstation.
  - Security: hooks execute local repo scripts only; keep hook commands minimal, pin through lockfile, and avoid untrusted shell/install scripts.
  - Compatibility: validated in this repo with Node 24 + npm workflows; CI remains the source of truth for server-side checks and does not depend on Husky.
  - Sonatype check: completed on 2026-03-05 for `pkg:npm/husky@9.1.7` (license `MIT`, `malicious=false`, `endOfLife=false`).

## Image Processing

- `sharp` (required by Next image optimization pipeline)

When removing dependencies, check:

1. `src/app/api/*`
2. `next.config.mjs`
3. `typography.ts`

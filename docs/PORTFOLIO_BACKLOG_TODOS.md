# Portfolio Backlog TODO Index

Source of truth: Notion "Portfolio Engineering Backlog" database.  
Purpose: keep one codebase-visible TODO entry per active backlog item so work can be picked up without context loss.
Sync: `npm run sync:portfolio-backlog` (manual pull from Notion).

## Active Backlog

- [ ] **P1 · Security** Configure Cloudflare Turnstile for Hermes chat/image APIs
      Notion: [Configure Cloudflare Turnstile for Hermes chat/image APIs](https://www.notion.so/Configure-Cloudflare-Turnstile-for-Hermes-chat-image-APIs-31bbe01e1e068194b26ccd2ed3f98a0b)
      Code touchpoints: `src/lib/security/guardrails.ts`, `src/app/api/openai/chat/route.ts`, `src/app/api/openai/image/route.ts`

- [ ] **P1 · Infra** Implement Redis-backed daily quota for Hermes image generation
      Notion: [Implement Redis-backed daily quota for Hermes image generation](https://www.notion.so/Implement-Redis-backed-daily-quota-for-Hermes-image-generation-31bbe01e1e068138972ef73b0db738d6)
      Code touchpoints: `src/lib/security/guardrails.ts`, `src/app/api/openai/image/route.ts`

- [ ] **P1 · Infra** Migrate Hermes guardrails to distributed rate limiting
      Notion: [Migrate Hermes guardrails to distributed rate limiting](https://www.notion.so/Migrate-Hermes-guardrails-to-distributed-rate-limiting-31bbe01e1e0681459e75f7a26774ac67)
      Code touchpoints: `src/lib/security/guardrails.ts`

- [ ] **P2 · CMS** Harden CMS cleanup cron observability and step-level metrics
      Notion: [Harden CMS cleanup cron observability and step-level metrics](https://www.notion.so/Harden-CMS-cleanup-cron-observability-and-step-level-metrics-31bbe01e1e0681a1b29dd85095533303)
      Code touchpoints: `src/app/api/cron/cms-cleanup/route.ts`, `src/lib/cms/notion/automationErrorLog.ts`, `src/lib/cms/notion/imageJobsCleanup.ts`, `src/lib/cms/notion/webhookEventLedger.ts`

- [ ] **P2 · Tech Curation** Add candidate explainability output to Tech Curation cron
      Notion: [Add candidate explainability output to Tech Curation cron](https://www.notion.so/Add-candidate-explainability-output-to-Tech-Curation-cron-31bbe01e1e068111933bd3998d1ba0f8)
      Code touchpoints: `src/lib/cms/notion/techCuration.ts`, `src/app/api/cron/cms-tech-curation/route.ts`

- [ ] **P2 · UI** Implement cover image style QA regression checks
      Notion: [Implement cover image style QA regression checks](https://www.notion.so/Implement-cover-image-style-QA-regression-checks-31bbe01e1e0681e7ad3ac3d583619382)
      Code touchpoints: `src/lib/cms/notion/projectionSync.ts`, `src/lib/cms/notion/publishGate.ts`, `src/app/api/cms/sync/articles/cover-regeneration/route.ts`

- [ ] **P3 · Infra** Add Notion backlog-to-PR traceability automation
      Notion: [Add Notion backlog-to-PR traceability automation](https://www.notion.so/Add-Notion-backlog-to-PR-traceability-automation-31bbe01e1e068168b367fe2de9732054)
      Code touchpoints: `src/lib/cms/notion/automationErrorLog.ts`, `src/app/api/cron/*`

- [ ] **P3 · Infra** Decide dotenv key ordering policy (.env.example)
      Notion: [Decide dotenv key ordering policy (.env.example)](https://www.notion.so/Decide-dotenv-key-ordering-policy-env-example-31bbe01e1e0681d1ad9ecd1159fb1a94)
      Code touchpoints: `.env.example`, dotenv linter configuration

- [ ] **P3 · Infra** Refactor cms-projection/cms-integrity into shared cron handler
      Notion: [Refactor cms-projection/cms-integrity into shared cron handler](https://www.notion.so/Refactor-cms-projection-cms-integrity-into-shared-cron-handler-31cbe01e1e06813f84ffeb50eedb7469)
      Code touchpoints: `src/app/api/cron/cms-projection/route.ts`, `src/app/api/cron/cms-integrity/route.ts`

- [ ] **P3 · CMS** Centralize site owner identity constant across CMS rendering
      Notion: [Centralize site owner identity constant across CMS rendering](https://www.notion.so/Centralize-site-owner-identity-constant-across-CMS-rendering-31cbe01e1e06818ea6f4f1c037fc8ef3)
      Code touchpoints: `src/components/cms/ArticleMeta.tsx`, `src/components/articles/ArticlesExplorer.tsx`, `src/lib/cms/notion/mapper.ts`, `src/lib/cms/siteSettingsRepo.ts`

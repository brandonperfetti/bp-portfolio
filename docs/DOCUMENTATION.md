# Documentation Standards

## Source of Truth

- `README.md` = onboarding and runtime usage.
- `.github/copilot-instructions.md` = concise AI-agent operating guide.
- `docs/*.md` = deep references by concern (architecture, styling, SEO, etc.).
- `docs/NOTION_CMS.md` = Notion-specific configuration and operations runbook.

## Progressive Disclosure Rule

When adding significant behavior:

1. Update the relevant focused doc in `docs/`.
2. Update `README.md` if setup/usage changed.
3. Update `.github/copilot-instructions.md` only if agent guidance changed.

## File Intent

- Keep each doc topical and short enough to scan quickly.
- Prefer concrete paths and command examples over abstract guidance.
- Avoid duplicating full code excerpts when path references are sufficient.

## Authoring Workflow

When adding or editing docs:

1. Update the smallest relevant file first (for example, `docs/FEATURES.md` for behavior changes).
2. Keep operational instructions in `README.md` and AI-agent instructions in `.github/copilot-instructions.md`.
3. Run formatting on changed markdown files before committing.
4. If formatter/linter reflows many unrelated docs, split that into a separate "docs formatting" commit.

Recommended commands:

```bash
npx prettier --write README.md .github/copilot-instructions.md docs/*.md
npm run lint
```

Style conventions:

- Use sentence-case prose with concise bullet lists.
- Prefer explicit file paths and commands over abstract guidance.
- Keep sections short and scannable; avoid deep nesting.

## Agent Compatibility

`AGENTS.md` and `CLAUDE.md` should point to the same instruction source to prevent drift.

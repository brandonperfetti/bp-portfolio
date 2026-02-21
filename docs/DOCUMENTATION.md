# Documentation Standards

## Source of Truth
- `README.md` = onboarding and runtime usage.
- `.github/copilot-instructions.md` = concise AI-agent operating guide.
- `docs/*.md` = deep references by concern (architecture, styling, SEO, etc.).

## Progressive Disclosure Rule
When adding significant behavior:
1. Update the relevant focused doc in `docs/`.
2. Update `README.md` if setup/usage changed.
3. Update `.github/copilot-instructions.md` only if agent guidance changed.

## File Intent
- Keep each doc topical and short enough to scan quickly.
- Prefer concrete paths and command examples over abstract guidance.
- Avoid duplicating full code excerpts when path references are sufficient.

## Agent Compatibility
`AGENTS.md` and `CLAUDE.md` should point to the same instruction source to prevent drift.

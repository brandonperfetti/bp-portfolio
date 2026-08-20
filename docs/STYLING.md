# Styling

## Tailwind v4 (CSS-first)

- Entry: `src/styles/tailwind.css` — `@import 'tailwindcss'`, typography
  plugin, `@config '../../typography.ts'`, shadcn design tokens on `:root` /
  `.dark`, and `@custom-variant dark (&:where(.dark, .dark *))`.
- Dark mode is class-based via next-themes. **Every new component ships with
  light and dark treatments** — parity is an acceptance criterion.
- Palette: zinc neutrals, teal accent (interactive), indigo for proficiency
  chips. Prism theme in `src/styles/prism.css`.

## Component conventions

- New primitives come from shadcn/ui via the CLI/MCP into
  `src/components/ui/` (radix-based, cva variants). Prefer these over the
  legacy v3 primitives; the legacy `src/components/Button.tsx` is
  port-remnant and slated for removal.
- Feature components live in folder-per-domain (`tech/`, `articles/`,
  `search/`, `cms/`, `heros/`, `motion/`).
- `cn()` (`src/lib/utils.ts`) for class merging in ui primitives; `clsx`
  elsewhere is fine.
- Icons: lucide-react (v1 — no brand logos; source those as media), a few
  project-local icons in `src/icons`, Heroicons only where already adopted.
- Focus states: visible `focus-visible` rings (teal) on every interactive
  element; never remove outlines without a replacement.
- Card hover/reveal motion comes from `src/components/motion/` wrappers —
  don't hand-roll GSAP in feature components (see `docs/DESIGN.md`).

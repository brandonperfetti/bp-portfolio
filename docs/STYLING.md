# Styling

## Tailwind v4 (CSS-first)

- Entry: `src/styles/tailwind.css` — `@import 'tailwindcss'`, typography
  plugin, `@config '../../typography.ts'`, shadcn design tokens on `:root` /
  `.dark`, and `@custom-variant dark (&:where(.dark, .dark *))`.
- Dark mode is class-based via next-themes. **Every new component ships with
  light and dark treatments** — parity is an acceptance criterion.
- Palette: zinc neutrals, teal accent (interactive), indigo for proficiency
  chips. Prism theme in `src/styles/prism.css`.

## shadcn primitives are themed at the token layer (#190)

This doc owns tokens — it is where the `:root` / `.dark` block and the palette
are already described — so the doctrine lives here rather than in
`docs/DESIGN.md`, which describes the component _system_ built on top.

- **Theme the variable, never repaint the primitive.** A shadcn primitive that
  arrives the wrong colour is a token bug. Fix `--primary` / `--ring` /
  `--muted-foreground` in `src/styles/tailwind.css`; do not add
  `className="bg-teal-700"` at the call site. Per-surface overrides are for
  **semantics** — this button means something different here — not for
  repainting one that should have been right everywhere.
- **The reference is the bespoke layer, not the target.**
  `src/components/Button.tsx` and the `.corvus-surface` token block are where
  the measured palette decisions already live (teal-700 fill, white label,
  hover DARKENS to teal-800). The shadcn tokens are derived from them; those
  files are not restyled to match shadcn.
- **`--primary` is a FILL pair, not a text colour.** teal-700 with white, and
  it does **not** invert between themes — that is what makes a `default`
  shadcn Button the sibling of the bespoke primary Button. `text-primary`
  therefore reads teal-700 on a near-black page in dark (3.69:1) and is a role
  confusion wherever it appears; use the link accent
  (`text-teal-700 dark:text-teal-400`) for text.
- **`--accent` is shadcn's hover surface, not the brand accent.** It stays on
  the zinc ramp. The brand accent is `--primary`.
- **Every value is a named Tailwind ramp step, and every pair is pinned.**
  `src/styles/shadcn-token-contrast.test.ts` parses the stylesheet, asserts
  each token IS the step its comment names, and re-derives the WCAG ratio for
  every pair in both themes (4.5:1 where the role is text, 3:1 where it is a
  fill edge or ring). Add a token, add its pair. Its sibling
  `corvus-accent-contrast.test.ts` does the same job for the `.corvus-surface`
  hex tokens.

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

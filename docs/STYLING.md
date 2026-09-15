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
  files are not restyled to match shadcn. **One exception, and only one:**
  `[2026-09-10, #202]` `--corvus-accent` now derives from the site-level
  `--link-accent` instead of being a reference for it — the arrow is reversed
  for that token because it was a second definition of a role the site already
  has, and it had drifted onto Tailwind v3 hexes while the utilities its call
  sites render resolve v4. The rest of the `.corvus-surface` block — including
  the whole `--corvus-accent-solid` / `-solid-hover` / `-ink` / `-ring-hover`
  fill family — is still the reference and still v3, and is not restyled to
  match shadcn.
- **`--primary` is a FILL pair, not a text colour.** teal-700 with white, and
  it does **not** invert between themes — that is what makes a `default`
  shadcn Button the sibling of the bespoke primary Button. `text-primary`
  therefore reads teal-700 on a near-black page in dark (3.69:1) and is a role
  confusion wherever it appears; use the link accent for text.
- **`--link-accent` is the INK half of the brand teal — use it, not the literal
  pair.** `[2026-09-10, #202]` teal-700 in light, teal-400 in dark; it is the
  one brand role that **inverts**, because ink has to clear 4.5:1 (WCAG 1.4.3)
  where a fill only has to clear 3:1 (1.4.11), and `--primary` at 3.69:1 on the
  dark page does not. Consume it as **`text-link-accent`** — a single class,
  because the token inverts on `.dark` for you. Do **not** write
  `text-teal-700 dark:text-teal-400`: that literal pair was in 13 source files
  before #202 and is the exact per-call-site repainting the first rule in this
  section forbids. `.corvus-surface`'s `--corvus-accent` is an alias of this
  token, so Corvus and the rest of the site cannot drift apart.
  The one thing `text-link-accent` is **not** is the badge ink — the chips in
  `ArticleMeta`, `TechCard` and `ArticlesExplorer` put teal-700 on a `bg-teal-50`
  tint and invert to teal-200/teal-300 on a teal-900/950 tint. Different pair,
  different backdrop; it still wants a token of its own.
- **`--accent` is shadcn's hover surface, not the brand accent.** It stays on
  the zinc ramp. The brand accent is `--primary`.
- **Hover DARKENS, including on the primitives.** `--primary-hover` (teal-800)
  is a token like everything else, and `ui/button.tsx`'s `default` variant
  consumes it as `hover:bg-primary-hover`. shadcn's stock `hover:bg-primary/90`
  composites the fill over the page and so lightens in light mode, which is the
  wrong direction for the same accessibility reason the bespoke Button records.
  Do not reintroduce an alpha hover on a fill. `--secondary-hover` is the same
  rule applied to the neutral fill: the `secondary` variant's stock
  `hover:bg-secondary/80` lightened in light mode too, and the token steps one
  notch down the zinc ramp in each theme (zinc-100 → zinc-200 light, zinc-800 →
  zinc-900 dark) so hover darkens in both.
- **Every value is a named Tailwind ramp step, and every role that renders text
  or a fill edge is pinned.** `src/styles/shadcn-token-contrast.test.ts` parses
  the stylesheet, asserts each token IS the step its comment names, and
  re-derives the WCAG ratio in both themes (4.5:1 where the role is text, 3:1
  where it is a fill edge or ring) for the surfaces
  (`--background`/`--foreground`, `--card*`, `--popover*`), primary and
  secondary each with their hover, muted, accent, `--link-accent` (4.5:1 on all
  three surfaces in both themes) and the ring — plus the base layer's
  `focus-visible` outline. Add a themed token, add its pair. Three documented
  exceptions: `--border`/`--input` are named steps in light but an alpha white
  in dark, so identity is not assertable there; `--destructive*` is the
  generator's red, unused by any component and deliberately unpinned; and
  `--primary-hover` is pinned on identity, label ratio and hover direction but
  not on its own fill edge, which is 2.64:1 against the dark page — recorded in
  the token's comment and left to the `default`/`teal` ticket. Its
  sibling `corvus-accent-contrast.test.ts` does the same job for the
  `.corvus-surface` hex tokens — and, since #202, resolves the one alias
  (`--corvus-accent` → `--link-accent`) across the two vocabularies so the
  Corvus surfaces stay measured against their own backgrounds.

## Component conventions

- New primitives come from shadcn/ui via the CLI/MCP into
  `src/components/ui/` (radix-based, cva variants). Prefer these over the
  legacy v3 primitives; the legacy `src/components/Button.tsx` is
  port-remnant and slated for removal once porting completes. **Until then it
  is the palette REFERENCE** — see §shadcn primitives are themed at the token
  layer: the measured teal decisions live in it, the shadcn tokens are derived
  from it, and it is not restyled to match them. "Do not restyle it" and "it
  goes away eventually" are the same position, not two.
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

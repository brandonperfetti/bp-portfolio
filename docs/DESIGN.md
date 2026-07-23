# Design system

## shadcn/ui

Primitives in `src/components/ui/` (Button first-class; add more via the
shadcn CLI or MCP). Radix `Slot` composition, cva variants, design tokens in
`tailwind.css`. Data-slot attributes are part of the shadcn v4 contract.

## Shader hero (wow moment #1)

- `src/components/heros/ShaderBackground.tsx` — one `<Shader>` per preset,
  composed from shaders.com layers (Swirl/Aurora/FilmGrain etc.). Presets are
  swappable via the registry (`presets.ts`); default dark preset is
  `northern-lights-2`, light mode uses `static-noise-4`.
- `ShaderHero.tsx` — client-only (`ssr: false`), clipped to the layout's
  max-w-7xl panel, aria-hidden, pointer-events-none. Fallback rules (§23):
  reduced motion or no WebGPU/WebGL2 → static CSS gradient; offscreen →
  IntersectionObserver unmounts the canvas; hero text is server HTML and
  LCPs without the canvas.
- Adding presets: read `shaders://guidelines` + relevant Pro Notes via the
  Shaders MCP first; install **presets**, not prebuilt sections.

## Motion (GSAP)

- All timing lives in `src/lib/motion/timing.ts` (eases, REVEAL_* presets,
  HOVER_TIMING, parallax scrub, headline constants). Change values there,
  never inline.
- Wrappers in `src/components/motion/`: `ScrollReveal` (ScrollTrigger
  reveals; defaults = REVEAL_GRID), `HoverMotionCard` (hover/focus lift with
  data-hover-* descendant markers), `AnimatedHeadline` (typewriter/line),
  `ParallaxGroup`.
- Every wrapper checks `usePrefersReducedMotion` and renders static DOM when
  set — new animated surfaces must do the same. Use the installed GSAP
  skills (gsap-react, gsap-scrolltrigger, …) when writing new GSAP code;
  `gsap.context` + cleanup on unmount is mandatory.

## CMS page builder

Block components live beside their configs (`src/blocks/<Name>/Component.tsx`)
and are dispatched by `src/blocks/RenderBlocks.tsx` — the admin block picker,
the components, and the `PageBuilder/RenderBlocks` stories are one 1:1 set.
Adding a block: config + Component + RenderBlocks case + story, then
`pnpm generate:types` / `generate:importmap` + a migration. Rich text renders
through `RichTextContent` (article typography pipeline); links through
`CMSLink` (internal refs keep the /articles contract).

## Storybook

- Storybook 10 (`@storybook/nextjs-vite`): `pnpm storybook` (dev, port 6006),
  `pnpm build-storybook` (CI gate).
- `.storybook/preview.tsx` imports the Tailwind entry and provides a
  light/dark toolbar toggle (next-themes decorator).
- a11y addon runs per story with `test: 'error'` — serious violations fail.
- `@storybook/addon-mcp` serves a component-manifest MCP at
  `http://localhost:6006/mcp` while the dev server runs — agents should
  check existing stories/components before writing new UI.
- Every shared component gets a story (Button, Card, TechCard, palette,
  ShaderHero, HermesChat idle are the seed set).

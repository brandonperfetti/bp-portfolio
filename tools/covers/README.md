# Cover design system tooling

Code-rendered article covers (2048×1152). Spec: `docs/CONTENT_STYLE.md` §9
(shell constants, hue map, composition archetypes, distinctiveness gate).

## Files

- `base.css` + `grain.html.frag` — the shared shell for HTML review renders
- `cover-{postId}.html` — per-post motif source of truth (inline SVG)
- `render.mjs` — Playwright HTML→PNG review render (`node render.mjs cover-54`)
- `assemble.py` — motif + shell → standalone `cover-NN.svg`; per-post glow
  ellipses live in its `GLOWS` dict (keep in sync with the HTML `.glow` CSS)
- `render-svg.mjs` — Playwright parity check of the standalone SVG
- `minify.py` — minify + XML-validate + base64 (`python3 minify.py 54`)

## Flow

1. Author/edit `cover-NN.html`; `node render.mjs cover-NN`; review the PNG.
2. Run the distinctiveness gate (thumbnail contact sheet vs last 5 covers).
3. `python3 assemble.py NN && python3 minify.py NN`.
4. Upload `cover-NN.min.b64` to Cloudinary as
   `data:image/svg+xml;base64,...` with `format: "png"`, under
   `bp-portfolio/images/articles/{slug}/cover-{letter}`.
5. Verify the delivered PNG visually (Cloudinary is the renderer of record),
   ingest into Payload, set `heroImage` + `meta.image`.

Playwright note: requires the `playwright` package resolvable from this
directory (symlink a global install as `node_modules` if needed). CSS is
inlined by `render.mjs`, so keep `base.css` beside the HTML files.

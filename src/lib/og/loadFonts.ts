import { readFileSync } from 'node:fs'

import type { OgCardFont } from '@/lib/og/types'

/**
 * Geist weights the generated OG card renders with. Satori (the engine behind
 * `next/og`) does not synthesize bold — it picks the nearest *registered* weight
 * — so every weight the card uses must be bundled and loaded here:
 *
 * - `800` — the card title.
 * - `600` — the brand eyebrow, domain, and role line.
 * - `400` — reserved for any regular-weight text the card grows into.
 *
 * The files are read from disk with `new URL(..., import.meta.url)` rather than a
 * bare string path so Next's file tracing statically detects and bundles them
 * into the route's serverless function (a plain `join(process.cwd(), …)` would
 * not be traced and would 500 at runtime on Vercel). `.woff` is used because
 * Satori accepts `.ttf`/`.otf`/`.woff` but not `.woff2`.
 */
const GEIST_WEIGHTS = [400, 600, 800] as const

let cached: OgCardFont[] | null = null

/**
 * Load the Geist font faces the OG card renders with, reading each `.woff` from
 * the co-located `fonts/` directory. Memoized for the lifetime of the server
 * process so repeated card renders don't re-read the files.
 *
 * @returns The font descriptors to pass to `ImageResponse`'s `fonts` option.
 */
export function loadOgCardFonts(): OgCardFont[] {
  if (cached) {
    return cached
  }

  cached = GEIST_WEIGHTS.map((weight) => ({
    name: 'Geist',
    data: readFileSync(new URL(`./fonts/geist-${weight}.woff`, import.meta.url)),
    weight,
    style: 'normal' as const,
  }))

  return cached
}

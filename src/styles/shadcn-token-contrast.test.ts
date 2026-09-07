// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * WCAG floors and palette identity for the shadcn token layer (`:root` /
 * `.dark` in `tailwind.css`), recomputed from source.
 *
 * @remarks Sibling of `corvus-accent-contrast.test.ts` and deliberately the
 * same shape: parse the real declarations out of the real stylesheet, run the
 * real WCAG arithmetic, report the ratio that failed. That file guards the
 * `.corvus-surface` block, which is hex; this one guards the shadcn block,
 * which is `oklch()` — the two colour vocabularies in this stylesheet, each
 * pinned in its own vocabulary rather than through a lossy conversion of one
 * into the other.
 *
 * Why it exists (#190): these variables shipped as the shadcn generator's zinc
 * scaffold. Their NEUTRAL half happened to be the site's own zinc ramp step for
 * step, so nothing looked wrong for a long time — but `--primary` was zinc-900
 * (inverting to zinc-200 in dark) and `--ring` was a zinc step, so every
 * primitive that reaches for the brand reached for near-black instead of teal,
 * and the focus halo had no relationship to the teal outline the base layer
 * draws. First live sighting: the /work feature cards stored
 * `appearance: "default"`, `CMSLink` rendered the shadcn `Button`
 * (`bg-primary text-primary-foreground`), and the cards grew near-black
 * buttons matching nothing on the site `[measured 2026-09-06]`.
 *
 * Two things are asserted, because a contrast test alone would let the tokens
 * drift back to a perfectly-accessible zinc:
 *
 * 1. **Identity** — each variable is the literal Tailwind v4.3.3 ramp step it
 *    claims to be, so "themed to the site palette" is a fact and not a comment.
 * 2. **Contrast** — every pair, in BOTH themes, against the floor its ROLE
 *    carries: 4.5:1 (WCAG 1.4.3) where the token renders text, 3:1
 *    (WCAG 1.4.11) where it is a fill edge or a ring.
 */

const css = readFileSync(path.resolve(__dirname, 'tailwind.css'), 'utf8')

/**
 * The same stylesheet with comment text removed.
 *
 * @remarks Same reason as the corvus file: prose about a token is not a use of
 * it, and this block's comments quote ramp steps and ratios by name.
 */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** An `oklch(L C H)` triple, L in 0..1. */
type Oklch = readonly [number, number, number]

/**
 * Parse one `oklch(...)` function into its three components.
 *
 * @param value - e.g. `oklch(0.511 0.096 186.391)` or `oklch(98.5% 0 none)`.
 * @returns Lightness (0..1), chroma, hue in degrees.
 */
function parseOklch(value: string): Oklch {
  const inner = /oklch\(([^)]*)\)/.exec(value)?.[1]
  expect(inner, `${value} must be an oklch() colour`).toBeDefined()
  const parts = (inner as string).trim().split(/\s+/)
  expect(parts.length, `${value} must have three components`).toBe(3)
  const num = (raw: string) => {
    // `none` is a real CSS Color 4 keyword and Tailwind's own ramp uses it for
    // an achromatic hue (`--color-zinc-50: oklch(98.5% 0 none)`); it means
    // "missing", which behaves as 0 here.
    if (raw === 'none') return 0
    const scaled = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : NaN
    return raw.endsWith('%') ? scaled : Number(raw)
  }
  const [l, c, h] = parts.map(num)
  return [l, c, h]
}

/**
 * Oklab/Oklch → linear sRGB, per the CSS Color 4 matrices.
 *
 * @remarks Deliberately unclamped before the caller clamps: a colour outside
 * the sRGB gamut would otherwise be silently rounded toward a ratio it does
 * not have. Every value here is an in-gamut Tailwind ramp step, and the clamp
 * in {@link luminance} is what keeps a future out-of-gamut token honest rather
 * than merely quiet.
 */
function oklchToLinearSrgb([L, C, hDeg]: Oklch): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** WCAG 2.x relative luminance of an oklch colour. */
function luminance(colour: Oklch): number {
  const [r, g, b] = oklchToLinearSrgb(colour).map((v) =>
    Math.min(1, Math.max(0, v)),
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two opaque oklch colours. */
function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Read one custom property out of a named rule block.
 *
 * @remarks Newline-anchored for the same reason the corvus file anchors: the
 * shadcn block's selectors are short and one is a substring of several others
 * in this stylesheet. Read from `cssCode` so a value quoted in prose — and
 * this block quotes several — cannot win over the declaration.
 *
 * @param selector - The rule's selector, matched literally.
 * @param name - Property name without the leading dashes.
 * @returns The declared colour.
 */
function token(selector: string, name: string): Oklch {
  const start = cssCode.indexOf(`\n${selector} {`)
  expect(start, `${selector} block must exist in tailwind.css`).toBeGreaterThan(
    -1,
  )
  const block = cssCode.slice(start + 1, cssCode.indexOf('\n}', start))
  const found = new RegExp(`--${name}:\\s*(oklch\\([^)]*\\))`).exec(block)?.[1]
  expect(
    found,
    `${selector} must declare --${name} as an oklch() colour`,
  ).toBeDefined()
  return parseOklch(found as string)
}

/**
 * The Tailwind v4.3.3 ramp steps this stylesheet is allowed to use.
 *
 * @remarks Copied from `node_modules/tailwindcss/theme.css`. They are
 * duplicated here on purpose rather than parsed out of the package: this file's
 * job is to state what the site's palette IS, and reading the same numbers the
 * subject reads would make the identity assertions tautological under a
 * Tailwind upgrade that moved a step. A future upgrade that shifts a ramp
 * should fail here and be looked at, not pass silently.
 */
const RAMP = {
  white: [1, 0, 0],
  'teal-400': [0.777, 0.152, 181.912],
  'teal-600': [0.6, 0.118, 184.704],
  'teal-700': [0.511, 0.096, 186.391],
  'zinc-50': [0.985, 0, 0],
  'zinc-100': [0.967, 0.001, 286.375],
  'zinc-600': [0.442, 0.017, 285.786],
  'zinc-400': [0.705, 0.015, 286.067],
  'zinc-800': [0.274, 0.006, 286.033],
  'zinc-900': [0.21, 0.006, 285.885],
  'zinc-950': [0.141, 0.005, 285.823],
} as const satisfies Record<string, Oklch>

const LIGHT = ':root'
const DARK = '.dark'

const TEXT_AA = 4.5
const NON_TEXT_AA = 3

/** Assert with the measured ratio in the failure message, not just a boolean. */
function expectRatio(fg: Oklch, bg: Oklch, floor: number, what: string) {
  const ratio = contrast(fg, bg)
  expect(
    ratio,
    `${what}: measured ${ratio.toFixed(2)}:1, floor ${floor}:1`,
  ).toBeGreaterThanOrEqual(floor)
}

/** Assert a declared token IS a named ramp step, to three decimals. */
function expectStep(
  selector: string,
  name: string,
  step: keyof typeof RAMP,
): Oklch {
  const actual = token(selector, name)
  const want = RAMP[step] as unknown as Oklch
  expect(
    actual.map((n) => Number(n.toFixed(3))),
    `${selector} --${name} must be ${step}`,
  ).toEqual(want.map((n) => Number(n.toFixed(3))))
  return actual
}

describe('shadcn token layer — palette identity (#190)', () => {
  it('paints --primary with the site CTA teal in BOTH themes, not a zinc step', () => {
    // The regression this file exists for. The brand fill is teal-700 with
    // white text and it does NOT invert: `src/components/Button.tsx`
    // (`bg-teal-700 … dark:bg-teal-700`) and `--corvus-accent-solid` both hold
    // one value across themes, so a shadcn `default` Button reads as their
    // sibling rather than as a near-black (light) / near-white (dark) slab.
    expectStep(LIGHT, 'primary', 'teal-700')
    expectStep(DARK, 'primary', 'teal-700')
    expectStep(LIGHT, 'primary-foreground', 'white')
    expectStep(DARK, 'primary-foreground', 'white')
  })

  it('paints --ring with the focus teal, matching the base-layer outline', () => {
    // `docs/STYLING.md`: "visible focus-visible rings (teal) on every
    // interactive element". The ring token had no relationship to that.
    // Light is teal-600 rather than the base layer's teal-500 because teal-500
    // measures 2.42:1 on the light `--background` — under 1.4.11. See the
    // finding recorded on the base-layer outline rule.
    expectStep(LIGHT, 'ring', 'teal-600')
    expectStep(DARK, 'ring', 'teal-400')
  })

  it('keeps the neutral roles on the site zinc ramp, step for step', () => {
    // NOT a no-op assertion despite these values being unchanged by #190: the
    // scaffold's neutrals already WERE the site's zinc steps, and this is what
    // records that as a deliberate finding rather than a coincidence nobody
    // may rely on. `--accent` is shadcn's HOVER SURFACE, not the brand accent
    // (that is `--primary`) — which is why it stays neutral.
    expectStep(LIGHT, 'secondary', 'zinc-100')
    expectStep(LIGHT, 'secondary-foreground', 'zinc-900')
    expectStep(LIGHT, 'muted', 'zinc-100')
    expectStep(LIGHT, 'accent', 'zinc-100')
    expectStep(LIGHT, 'accent-foreground', 'zinc-900')
    expectStep(DARK, 'secondary', 'zinc-800')
    expectStep(DARK, 'secondary-foreground', 'zinc-50')
    expectStep(DARK, 'muted', 'zinc-800')
    expectStep(DARK, 'accent', 'zinc-800')
    expectStep(DARK, 'accent-foreground', 'zinc-50')
  })

  it('lifts the light --muted-foreground to a step that clears AA on --muted', () => {
    // zinc-500 measures 4.39:1 on zinc-100 — a near miss, and the one place
    // the scaffold's neutrals were not already right. Dark was always fine
    // (zinc-400 on zinc-800 is 5.66:1), so only light moves.
    expectStep(LIGHT, 'muted-foreground', 'zinc-600')
    expectStep(DARK, 'muted-foreground', 'zinc-400')
  })
})

/**
 * Every themed pair, in both themes, against the floor its role carries.
 *
 * @remarks The roles come from the primitives that consume them, read at
 * `src/components/ui/button.tsx`. The `default` variant paints the primary
 * fill and its foreground label; `secondary` does the same with the secondary
 * pair; `outline` and `ghost` hover to the accent pair; and
 * `focus-visible:border-ring` paints the ring at full opacity. A fill's own
 * edge against the page is non-text UI (1.4.11); the label on it is text
 * (1.4.3).
 */
describe('shadcn token layer — WCAG floors in both themes (#190)', () => {
  const bg = {
    light: token(LIGHT, 'background'),
    dark: token(DARK, 'background'),
  }

  for (const theme of ['light', 'dark'] as const) {
    const sel = theme === 'light' ? LIGHT : DARK
    const page = bg[theme]

    describe(`[${theme}]`, () => {
      it('primary: label on the fill, and the fill against the page', () => {
        expectRatio(
          token(sel, 'primary-foreground'),
          token(sel, 'primary'),
          TEXT_AA,
          `[${theme}] --primary-foreground on --primary`,
        )
        expectRatio(
          token(sel, 'primary'),
          page,
          NON_TEXT_AA,
          `[${theme}] --primary fill edge on --background`,
        )
      })

      it('secondary and accent: label on the surface', () => {
        expectRatio(
          token(sel, 'secondary-foreground'),
          token(sel, 'secondary'),
          TEXT_AA,
          `[${theme}] --secondary-foreground on --secondary`,
        )
        expectRatio(
          token(sel, 'accent-foreground'),
          token(sel, 'accent'),
          TEXT_AA,
          `[${theme}] --accent-foreground on --accent`,
        )
      })

      it('muted-foreground: text on the page AND on the muted surface', () => {
        // Both, because `text-muted-foreground` is used over each — a token
        // that only cleared the page would fail the moment it landed in a
        // `bg-muted` panel.
        expectRatio(
          token(sel, 'muted-foreground'),
          page,
          TEXT_AA,
          `[${theme}] --muted-foreground on --background`,
        )
        expectRatio(
          token(sel, 'muted-foreground'),
          token(sel, 'muted'),
          TEXT_AA,
          `[${theme}] --muted-foreground on --muted`,
        )
      })

      it('ring: a non-text indicator against the page', () => {
        expectRatio(
          token(sel, 'ring'),
          page,
          NON_TEXT_AA,
          `[${theme}] --ring on --background`,
        )
      })
    })
  }
})

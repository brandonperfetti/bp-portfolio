// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * WCAG floors for the `.corvus-surface` accent tokens, recomputed from source.
 *
 * @remarks These tokens are the one place on the site where a colour decision
 * is invisible to every other guard. They are plain CSS custom properties, so
 * TypeScript cannot see them, Storybook's a11y addon never renders the surface
 * that scopes them, and the components they override already carry their own
 * (passing) Tailwind classes — which is exactly how the CTA's hover token sat
 * at teal-600, and 3.74:1, while `src/components/CorvusChat.tsx` looked
 * fixed. A string pin would have caught the value changing; it would
 * not have caught the value being wrong. So this parses the real hex out of
 * `tailwind.css` and runs the real WCAG arithmetic against the real
 * backgrounds, and reports the ratio it computed when it fails.
 *
 * Scope is deliberately the accent group and the surfaces those tokens
 * actually render on, in both themes — not a general colour audit.
 */

const css = readFileSync(path.resolve(__dirname, 'tailwind.css'), 'utf8')

/**
 * The same stylesheet with comment text removed.
 *
 * @remarks Everything below reads CODE, and prose about a token is not a use
 * of it. Caught the moment this file was written: the token block's own
 * comment names `var(--corvus-accent-hover)` in order to record that nothing
 * references it, which made the "is it referenced" tripwire fire on the
 * sentence saying it is not. Same lesson `scripts/lib/sql-comments.mjs` exists
 * for, one language over. CSS has a single comment syntax and nothing in this
 * stylesheet quotes a comment terminator inside a string, so one substitution
 * is the whole job here — no tokenizer needed.
 */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** WCAG 2.x relative luminance of an `#rrggbb` string. */
function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map(
    (i) => parseInt(value.slice(i, i + 2), 16) / 255,
  )
  const linear = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** WCAG contrast ratio between two opaque `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Composite a partially transparent colour over an opaque one.
 *
 * @remarks Both `--corvus-panel` in dark (`rgb(255 255 255 / 4%)`) and the
 * composer's hover fill (`color-mix(… 12%, transparent)`) are alpha values
 * that only have a contrast ratio once something is behind them.
 *
 * @param fg - Foreground `#rrggbb`.
 * @param percent - Foreground alpha, 0-100.
 * @param bg - Opaque backdrop `#rrggbb`.
 * @returns The composited opaque colour.
 */
function over(fg: string, percent: number, bg: string): string {
  const parse = (hex: string) =>
    [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16))
  const [f, b] = [parse(fg), parse(bg)]
  const alpha = percent / 100
  return `#${f
    .map((c, i) => Math.round(alpha * c + (1 - alpha) * b[i]))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Read one custom property out of a named rule block.
 *
 * @param selector - The rule's selector, matched literally.
 * @param token - Property name without the leading dashes.
 * @returns The declared `#rrggbb` value.
 */
function token(selector: string, name: string): string {
  // Newline-anchored: `.corvus-surface {` is a substring of the light block's
  // `:root:not(.dark) .corvus-surface {`, so an unanchored search would read
  // whichever came first and silently attribute one theme's values to the
  // other. Read from `cssCode` so a hex quoted in prose cannot win.
  const start = cssCode.indexOf(`\n${selector} {`)
  expect(start, `${selector} block must exist in tailwind.css`).toBeGreaterThan(
    -1,
  )
  const block = cssCode.slice(start + 1, cssCode.indexOf('\n}', start))
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]
  expect(found, `${selector} must declare --${name} as a hex`).toBeDefined()
  return (found as string).toLowerCase()
}

const DARK = '.corvus-surface'
const LIGHT = ':root:not(.dark) .corvus-surface'

// Tokens whose value is declared once and inherited by the light block.
const accentInk = token(DARK, 'corvus-accent-ink')
const accentSolid = token(DARK, 'corvus-accent-solid')
const accentSolidHover = token(DARK, 'corvus-accent-solid-hover')
const accentRingHover = token(DARK, 'corvus-accent-ring-hover')

// Per-theme surfaces these render on.
const groundDark = token(DARK, 'corvus-ground')
const groundLight = token(LIGHT, 'corvus-ground')
const panelLight = token(LIGHT, 'corvus-panel')
// `--corvus-panel` in dark is `rgb(255 255 255 / 4%)`, not a hex — composited.
const panelDark = over('#ffffff', 4, groundDark)
const accentDark = token(DARK, 'corvus-accent')
const accentLight = token(LIGHT, 'corvus-accent')
const mutedDark = token(DARK, 'corvus-muted')
const mutedLight = token(LIGHT, 'corvus-muted')
const bubbleDark = token(DARK, 'corvus-bubble-assistant')
const bubbleLight = token(LIGHT, 'corvus-bubble-assistant')

const TEXT_AA = 4.5
const NON_TEXT_AA = 3

/** Assert with the measured ratio in the failure message, not just a boolean. */
function expectRatio(fg: string, bg: string, floor: number, what: string) {
  const ratio = contrast(fg, bg)
  expect(
    ratio,
    `${what}: ${fg} on ${bg} measured ${ratio.toFixed(2)}:1, floor ${floor}:1`,
  ).toBeGreaterThanOrEqual(floor)
}

describe('--corvus-accent-solid-hover (sign-in gate CTA hover)', () => {
  it('keeps the CTA label above the AA text floor in both themes', () => {
    // The regression this exists for. Neither the fill nor the ink is
    // redefined in the light block, so ONE value has to clear the floor for
    // both themes — which is why a single assertion covers both.
    expectRatio(accentInk, accentSolidHover, TEXT_AA, 'CTA label on hover fill')
  })

  it('is a real move away from the resting fill', () => {
    // teal-700 also clears the text floor, and would be useless: it IS the
    // resting fill, so the hover would be invisible.
    expect(accentSolidHover).not.toBe(accentSolid)
    expect(
      contrast(accentSolidHover, accentSolid),
      'hover must be perceptibly different from rest',
    ).toBeGreaterThan(1.15)
  })

  it('hovers DARKER than it rests, never lighter', () => {
    // The direction is the whole finding: lightening on hover is what took
    // the label under AA in the first place, here and on both Buttons.
    expect(
      luminance(accentSolidHover),
      'a lighter hover fill is what put this under AA',
    ).toBeLessThan(luminance(accentSolid))
  })

  it('keeps the resting CTA above both floors', () => {
    // Unchanged by this fix, pinned so a future move of the RESTING fill
    // cannot quietly undo what the hover fix bought.
    expectRatio(accentInk, accentSolid, TEXT_AA, 'CTA label at rest')
    expectRatio(accentSolid, panelLight, NON_TEXT_AA, 'rest fill vs light gate')
    expectRatio(accentSolid, panelDark, NON_TEXT_AA, 'rest fill vs dark gate')
  })

  it('clears the non-text floor against the light gate panel', () => {
    // Light improves on both axes, which is why the fill step survives there.
    // Dark no longer uses a fill step at all (#139, below) — that is what
    // closed the ~2.6:1 edge this file used to record as an accepted residual.
    expectRatio(
      accentSolidHover,
      panelLight,
      NON_TEXT_AA,
      'hover fill vs light gate',
    )
  })

  it('is scoped to the light theme only — dark keeps the resting fill on hover', () => {
    // The bounding proof (#139): the darker fill is what fails against the
    // near-black gate panel, so dark must NOT take it.
    expect(
      contrast(accentSolidHover, panelDark),
      'premise check: the darker hover fill really does miss the dark edge floor',
    ).toBeLessThan(NON_TEXT_AA)
    expect(
      /:root\.dark\s+\.corvus-surface\s+\[data-slot='sign-in-gate-cta'\]:hover\s*\{[^}]*background-color:\s*var\(--corvus-accent-solid\)/.test(
        cssCode,
      ),
      "dark's :hover must pin the RESTING fill, overriding the shared darker-fill hover",
    ).toBe(true)
  })
})

/**
 * #139 — the dark CTA's hover affordance is a ring, not a fill step.
 *
 * @remarks The ring has TWO edges and both are non-text UI under WCAG 1.4.11:
 * the inner one against the button's own (resting) fill, the outer one against
 * the gate panel. A ring that only cleared one of them would be invisible on
 * the other side.
 */
describe('--corvus-accent-ring-hover (dark sign-in gate CTA hover ring)', () => {
  it('clears the non-text floor on BOTH of its edges', () => {
    expectRatio(
      accentRingHover,
      accentSolid,
      NON_TEXT_AA,
      'ring vs resting fill',
    )
    expectRatio(
      accentRingHover,
      panelDark,
      NON_TEXT_AA,
      'ring vs dark gate panel',
    )
  })

  it('leaves the label — and the resting fill it sits on — untouched', () => {
    // The fill does not move on hover in dark, so the label keeps the resting
    // ratio rather than acquiring a second, worse one.
    expectRatio(
      accentInk,
      accentSolid,
      TEXT_AA,
      'CTA label under the dark hover',
    )
    expectRatio(
      accentSolid,
      panelDark,
      NON_TEXT_AA,
      'fill edge under the dark hover',
    )
  })

  it('is not --corvus-accent, which would miss the floor on its inner edge', () => {
    // teal-400 measures ~2.94:1 against teal-700 — the near miss that made a
    // purpose-named token worth having.
    expect(accentRingHover).not.toBe(accentDark)
    expect(contrast(accentDark, accentSolid)).toBeLessThan(NON_TEXT_AA)
  })

  it('is actually rendered, dark-only, and never fights the focus indicator', () => {
    // A token nothing references cannot fail a contrast check — and cannot
    // help a user either. Pin the wiring, not just the value.
    expect(
      cssCode.includes('var(--corvus-accent-ring-hover)'),
      '--corvus-accent-ring-hover must be referenced by the CTA hover rule',
    ).toBe(true)
    // Dark-only: the light block must not redefine it, and the ring rule must
    // be scoped to `:root.dark`.
    expect(
      new RegExp(
        `:root\\.dark[\\s\\S]{0,200}?:hover:not\\(:focus-visible\\)\\s*\\{[^}]*var\\(--corvus-accent-ring-hover\\)`,
      ).test(cssCode),
      'the ring must be dark-scoped and suppressed while :focus-visible shows',
    ).toBe(true)
  })

  it('honours prefers-reduced-motion for its transition', () => {
    // Repo convention (`.animate-text-shimmer`, the mic pulse, the
    // constellation twinkle): the motion is declared, then switched off in a
    // `prefers-reduced-motion: reduce` block.
    const reduceBlocks = cssCode.match(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/g,
    )
    expect(reduceBlocks, 'no reduced-motion blocks found').toBeTruthy()
    expect(
      (reduceBlocks as string[]).some(
        (block) =>
          block.includes("[data-slot='sign-in-gate-cta']") &&
          /transition:\s*none/.test(block),
      ),
      "the CTA's hover transition must be disabled under prefers-reduced-motion",
    ).toBe(true)
  })
})

describe('--corvus-accent (text and icon roles)', () => {
  it('clears the AA text floor everywhere it renders as text', () => {
    // Two genuine TEXT roles: the 12px copy-button label, which sits on the
    // page ground, and markdown links inside the ASSISTANT bubble (user
    // bubbles are rendered as plain text, so no link ever lands on the teal
    // user fill).
    expectRatio(accentLight, groundLight, TEXT_AA, 'copy label [light]')
    expectRatio(accentDark, groundDark, TEXT_AA, 'copy label [dark]')
    expectRatio(accentLight, bubbleLight, TEXT_AA, 'markdown link [light]')
    expectRatio(accentDark, bubbleDark, TEXT_AA, 'markdown link [dark]')
    expectRatio(accentLight, panelLight, TEXT_AA, 'scroll button [light]')
    expectRatio(accentDark, panelDark, TEXT_AA, 'scroll button [dark]')
  })

  it('clears the non-text floor everywhere it renders as an icon or outline', () => {
    // Focus outlines and the empty-state/avatar/mic marks sit on the ground;
    // the send icon sits on its own `color-mix(--corvus-muted 12%)` hover fill.
    expectRatio(accentLight, groundLight, NON_TEXT_AA, 'focus ring [light]')
    expectRatio(accentDark, groundDark, NON_TEXT_AA, 'focus ring [dark]')
    expectRatio(
      accentLight,
      over(mutedLight, 12, groundLight),
      NON_TEXT_AA,
      'send icon on hover fill [light]',
    )
    expectRatio(
      accentDark,
      over(mutedDark, 12, groundDark),
      NON_TEXT_AA,
      'send icon on hover fill [dark]',
    )
  })
})

describe('--corvus-accent-hover (deleted in #139)', () => {
  it('is gone from both theme blocks, prose included', () => {
    // It was referenced by nothing and its light value (#0d9488) measured
    // ~3.4:1 as text on the panel — a trap for whoever wired it up. The dark
    // hover ring got its own purpose-named token instead. Declaration-shaped
    // match so the block comment explaining the deletion is allowed to name it.
    expect(/--corvus-accent-hover:/.test(css)).toBe(false)
    expect(cssCode.includes('var(--corvus-accent-hover)')).toBe(false)
  })
})

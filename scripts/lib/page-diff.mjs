/**
 * Browserless half of the page-parity harness (#24): argument parsing, the
 * pixel comparison, and the pass/fail verdict.
 *
 * Kept free of Playwright and sharp on purpose — every rule that decides
 * whether a migration passes lives here, so it can be unit-tested in an
 * environment with no browsers installed (see `page-diff.test.ts`).
 * `scripts/diff-pages.mjs` supplies the pixels.
 *
 * @module
 */

/** Default share of pixels allowed to differ before the run fails, in percent. */
export const DEFAULT_THRESHOLD_PERCENT = 0.1

/**
 * Default per-pixel colour tolerance, 0–1, on pixelmatch's YIQ scale.
 *
 * @remarks Not zero: the two URLs are rendered by different code paths, so
 * text anti-aliasing differs by a shade or two on otherwise identical glyphs.
 * A tolerance here is what stops those from swamping the real differences the
 * gate is looking for.
 */
export const DEFAULT_PIXEL_THRESHOLD = 0.1

/** The two widths the parity gate compares at. */
export const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

/** Where diff images land unless `--out` says otherwise (gitignored). */
export const DEFAULT_OUT_DIR = 'test-results/diff-pages'

/**
 * Name of the environment variable holding the Vercel protection-bypass
 * secret. The value is never logged, written to a filename, or defaulted.
 */
export const BYPASS_TOKEN_ENV = 'VERCEL_AUTOMATION_BYPASS_SECRET'

/** Header Vercel reads the bypass secret from. */
export const BYPASS_HEADER = 'x-vercel-protection-bypass'

/**
 * CSS injected into both pages before capture.
 *
 * @remarks Reduced-motion emulation already makes this site's animated
 * surfaces static, but it cannot help with third-party or decorative CSS that
 * ignores the media query — so animations are also zeroed out and pinned to
 * their first frame. `caret-color` matters because a focused input blinks a
 * caret into one screenshot and not the other.
 */
export const FREEZE_CSS = `
*, *::before, *::after {
  animation-delay: -0.0001s !important;
  animation-duration: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
`

/**
 * Parse the CLI arguments and environment into a run configuration.
 *
 * @param argv - Arguments after the script name.
 * @param env - Process environment, read only for the bypass secret.
 * @returns The resolved options.
 * @throws Error when the two URLs are missing or an option is malformed —
 * the caller turns that into a usage message and a nonzero exit.
 */
export function parseArgs(argv, env = {}) {
  const positional = []
  const flags = new Map()

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const [name, ...rest] = arg.slice(2).split('=')
    flags.set(name, rest.length > 0 ? rest.join('=') : 'true')
  }

  const [baselineUrl, candidateUrl] = positional
  if (!baselineUrl || !candidateUrl) {
    throw new Error(
      'Two URLs are required: diff-pages.mjs <baseline-url> <candidate-url>',
    )
  }

  const number = (name, fallback) => {
    if (!flags.has(name)) return fallback
    const value = Number(flags.get(name))
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`--${name} must be a non-negative number`)
    }
    return value
  }

  const pixelThreshold = number('pixel-threshold', DEFAULT_PIXEL_THRESHOLD)
  if (pixelThreshold > 1) {
    throw new Error('--pixel-threshold must be between 0 and 1')
  }

  return {
    baselineUrl,
    candidateUrl,
    threshold: number('threshold', DEFAULT_THRESHOLD_PERCENT),
    pixelThreshold,
    outDir: flags.get('out') ?? DEFAULT_OUT_DIR,
    masks: parseMasks(flags.get('mask')),
    viewports: parseViewports(flags.get('widths')),
    timeout: number('timeout', 30_000),
    prescroll: flags.get('no-prescroll') !== 'true',
    bypassToken: env[BYPASS_TOKEN_ENV] || flags.get('bypass-token') || '',
  }
}

/**
 * Split a `--mask` value into CSS selectors.
 *
 * @param value - Comma-separated selector list, if any.
 * @returns The selectors, empty when nothing was passed.
 * @remarks Masked regions are painted a flat colour by Playwright on *both*
 * captures, which is how an unstabilisable region (the shader canvas) stops
 * being the reason a parity run fails.
 */
export function parseMasks(value) {
  if (!value || value === 'true') return []
  return value
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
}

/**
 * Parse a `--widths` value into viewports.
 *
 * @param value - `WIDTHxHEIGHT` pairs, comma separated (`1440x900,390x844`).
 * @returns The viewports to capture at, defaulting to desktop + mobile.
 * @throws Error when a pair is not two positive integers.
 */
export function parseViewports(value) {
  if (!value || value === 'true') return DEFAULT_VIEWPORTS

  return value
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const match = /^(\d+)x(\d+)$/.exec(pair)
      if (!match) {
        throw new Error(
          `--widths entries must look like 1440x900, got "${pair}"`,
        )
      }
      const width = Number(match[1])
      const height = Number(match[2])
      return { name: `${width}x${height}`, width, height }
    })
}

/**
 * Remove anything secret-shaped from a URL before it is printed.
 *
 * @param url - The URL as given on the command line.
 * @returns The URL with sensitive query values replaced by `REDACTED`.
 * @remarks The bypass secret is passed as a header by this harness, but a
 * migration ticket may well paste a preview URL that carries one as a query
 * param. Console output and the JSON report both go through here so a secret
 * never lands in a log or an artifact.
 */
export function redactUrl(url) {
  const secretish = /token|secret|bypass|key|signature/i
  try {
    const parsed = new URL(url)
    for (const name of [...parsed.searchParams.keys()]) {
      if (secretish.test(name)) parsed.searchParams.set(name, 'REDACTED')
    }
    return parsed.toString()
  } catch {
    return url
  }
}

/** Blend one channel of a possibly-transparent pixel onto white. */
function blendOntoWhite(channel, alpha) {
  return 255 + (channel - 255) * alpha
}

/**
 * Squared YIQ colour distance between two RGBA pixels.
 *
 * @param a - Baseline frame data.
 * @param ai - Byte offset of the pixel in `a`.
 * @param b - Candidate frame data.
 * @param bi - Byte offset of the pixel in `b`.
 * @returns The squared perceptual distance, 0 for identical pixels.
 * @remarks This is pixelmatch's metric — luminance weighted far above
 * chrominance, which is what makes it tolerant of anti-aliasing shades but
 * unforgiving about a moved edge.
 */
function pixelDelta(a, ai, b, bi) {
  if (
    a[ai] === b[bi] &&
    a[ai + 1] === b[bi + 1] &&
    a[ai + 2] === b[bi + 2] &&
    a[ai + 3] === b[bi + 3]
  ) {
    return 0
  }

  const aAlpha = a[ai + 3] / 255
  const bAlpha = b[bi + 3] / 255
  const ar = blendOntoWhite(a[ai], aAlpha)
  const ag = blendOntoWhite(a[ai + 1], aAlpha)
  const ab = blendOntoWhite(a[ai + 2], aAlpha)
  const br = blendOntoWhite(b[bi], bAlpha)
  const bg = blendOntoWhite(b[bi + 1], bAlpha)
  const bb = blendOntoWhite(b[bi + 2], bAlpha)

  const y = (r, g, bl) => r * 0.29889531 + g * 0.58662247 + bl * 0.11448223
  const i = (r, g, bl) => r * 0.59597799 - g * 0.2741761 - bl * 0.32180189
  const q = (r, g, bl) => r * 0.21147017 - g * 0.52261711 + bl * 0.31114694

  const dy = y(ar, ag, ab) - y(br, bg, bb)
  const di = i(ar, ag, ab) - i(br, bg, bb)
  const dq = q(ar, ag, ab) - q(br, bg, bb)

  return 0.5053 * dy * dy + 0.299 * di * di + 0.1957 * dq * dq
}

/** Largest possible squared YIQ distance — black against white. */
export const MAX_YIQ_DELTA = 35215

/**
 * Compare two RGBA frames and paint a diff image.
 *
 * @param baseline - `{ data, width, height }` with 4 bytes per pixel.
 * @param candidate - The frame to compare against the baseline.
 * @param options - `pixelThreshold` (0–1) colour tolerance.
 * @returns `{ differing, total, percent, width, height, sizeMismatch, diff }`,
 * where `diff` is RGBA bytes for the union of both frames: the baseline
 * greyed back, differing pixels in magenta.
 * @remarks Frames of different heights are compared over the union rather
 * than cropped — a page that grew by a section has genuinely failed parity,
 * and silently comparing only the shared area would hide exactly that.
 */
export function compareFrames(baseline, candidate, options = {}) {
  const pixelThreshold = options.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD
  const maxDelta = MAX_YIQ_DELTA * pixelThreshold * pixelThreshold

  const width = Math.max(baseline.width, candidate.width)
  const height = Math.max(baseline.height, candidate.height)
  const diff = new Uint8ClampedArray(width * height * 4)

  let differing = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const out = (y * width + x) * 4
      const inBaseline = x < baseline.width && y < baseline.height
      const inCandidate = x < candidate.width && y < candidate.height

      let different
      if (inBaseline && inCandidate) {
        const ai = (y * baseline.width + x) * 4
        const bi = (y * candidate.width + x) * 4
        different = pixelDelta(baseline.data, ai, candidate.data, bi) > maxDelta
        if (!different) {
          // Identical pixels are drawn as a washed-out version of the
          // baseline, so the magenta reads as an overlay on the page.
          const grey =
            255 -
            (255 -
              (baseline.data[ai] * 0.3 +
                baseline.data[ai + 1] * 0.59 +
                baseline.data[ai + 2] * 0.11)) *
              0.15
          diff[out] = grey
          diff[out + 1] = grey
          diff[out + 2] = grey
          diff[out + 3] = 255
        }
      } else {
        // Present in one capture only: a real difference in page height or
        // width, not something to average away.
        different = true
      }

      if (different) {
        differing++
        diff[out] = 255
        diff[out + 1] = 0
        diff[out + 2] = 255
        diff[out + 3] = 255
      }
    }
  }

  const total = width * height
  return {
    differing,
    total,
    percent: total === 0 ? 0 : (differing / total) * 100,
    width,
    height,
    sizeMismatch:
      baseline.width !== candidate.width ||
      baseline.height !== candidate.height,
    diff,
  }
}

/**
 * Decide whether a set of per-viewport comparisons passes the gate.
 *
 * @param comparisons - One entry per viewport, each with a `percent`.
 * @param threshold - Maximum share of differing pixels, in percent.
 * @returns `{ pass, worst, exitCode }` — the gate fails on the *worst*
 * viewport, never on an average, so a desktop-only regression cannot be
 * cancelled out by a clean mobile capture.
 */
export function verdict(comparisons, threshold = DEFAULT_THRESHOLD_PERCENT) {
  const worst = comparisons.reduce(
    (highest, comparison) =>
      comparison.percent > (highest?.percent ?? -1) ? comparison : highest,
    null,
  )
  const pass = comparisons.length > 0 && (worst?.percent ?? 0) <= threshold
  return { pass, worst, exitCode: pass ? 0 : 1 }
}

/**
 * Render the human-readable run summary.
 *
 * @param result - `{ baselineUrl, candidateUrl, threshold, comparisons }`.
 * @returns Lines of text for the console, with URLs already redacted.
 */
export function formatSummary(result) {
  const { pass } = verdict(result.comparisons, result.threshold)
  const lines = [
    `baseline:  ${redactUrl(result.baselineUrl)}`,
    `candidate: ${redactUrl(result.candidateUrl)}`,
    `threshold: ${result.threshold}% differing pixels`,
    '',
  ]

  for (const comparison of result.comparisons) {
    const status = comparison.percent <= result.threshold ? 'PASS' : 'FAIL'
    lines.push(
      `  ${status}  ${comparison.viewport.padEnd(8)} ` +
        `${comparison.percent.toFixed(4)}% ` +
        `(${comparison.differing}/${comparison.total} px, ` +
        `${comparison.width}x${comparison.height})` +
        (comparison.sizeMismatch ? '  [size mismatch]' : ''),
    )
  }

  lines.push('', pass ? 'PASS — within threshold' : 'FAIL — above threshold')
  return lines.join('\n')
}

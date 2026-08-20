// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  BYPASS_TOKEN_ENV,
  DEFAULT_OUT_DIR,
  DEFAULT_PIXEL_THRESHOLD,
  DEFAULT_THRESHOLD_PERCENT,
  DEFAULT_VIEWPORTS,
  FREEZE_CSS,
  compareFrames,
  formatSummary,
  parseArgs,
  parseMasks,
  parseViewports,
  redactUrl,
  verdict,
} from './page-diff.mjs'

/** Build a solid RGBA frame. */
const frame = (
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number] = [255, 255, 255, 255],
) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { data, width, height }
}

/** Paint one pixel of a frame. */
const setPixel = (
  target: ReturnType<typeof frame>,
  x: number,
  y: number,
  [r, g, b, a]: [number, number, number, number],
) => {
  const i = (y * target.width + x) * 4
  target.data[i] = r
  target.data[i + 1] = g
  target.data[i + 2] = b
  target.data[i + 3] = a
}

/**
 * Guards the browserless half of #24 — everything that decides whether a
 * page migration passes the parity gate. No browser is launched here, which
 * is the point: this suite runs in environments where Playwright's browsers
 * cannot be installed.
 */
describe('parseArgs', () => {
  it('requires both URLs', () => {
    expect(() => parseArgs([])).toThrow(/Two URLs are required/)
    expect(() => parseArgs(['https://example.com'])).toThrow(
      /Two URLs are required/,
    )
  })

  it('defaults to the settled gate configuration', () => {
    const options = parseArgs(['https://a.test/', 'https://b.test/page'])

    expect(options.baselineUrl).toBe('https://a.test/')
    expect(options.candidateUrl).toBe('https://b.test/page')
    expect(options.threshold).toBe(DEFAULT_THRESHOLD_PERCENT)
    expect(options.threshold).toBe(0.1)
    expect(options.pixelThreshold).toBe(DEFAULT_PIXEL_THRESHOLD)
    expect(options.outDir).toBe(DEFAULT_OUT_DIR)
    expect(options.masks).toEqual([])
    expect(options.prescroll).toBe(true)
    expect(options.viewports).toEqual(DEFAULT_VIEWPORTS)
    // The two widths the gate is specified at.
    expect(options.viewports.map((v: { width: number }) => v.width)).toEqual([
      1440, 390,
    ])
  })

  it('overrides the threshold from a flag', () => {
    expect(parseArgs(['a', 'b', '--threshold=0.5']).threshold).toBe(0.5)
    expect(parseArgs(['a', 'b', '--threshold=0']).threshold).toBe(0)
  })

  it('rejects thresholds that could not gate anything', () => {
    expect(() => parseArgs(['a', 'b', '--threshold=-1'])).toThrow()
    expect(() => parseArgs(['a', 'b', '--threshold=lots'])).toThrow()
    expect(() => parseArgs(['a', 'b', '--pixel-threshold=2'])).toThrow(
      /between 0 and 1/,
    )
  })

  it('reads the bypass secret from the environment, never from a default', () => {
    expect(parseArgs(['a', 'b']).bypassToken).toBe('')
    expect(
      parseArgs(['a', 'b'], { [BYPASS_TOKEN_ENV]: 'from-env' }).bypassToken,
    ).toBe('from-env')
    // An explicit flag is honoured, but the environment wins so a shell
    // history entry cannot silently override CI configuration.
    expect(
      parseArgs(['a', 'b', '--bypass-token=from-flag'], {
        [BYPASS_TOKEN_ENV]: 'from-env',
      }).bypassToken,
    ).toBe('from-env')
  })

  it('takes a selector list for regions that cannot be stabilised', () => {
    expect(parseArgs(['a', 'b', '--mask=canvas, .shader']).masks).toEqual([
      'canvas',
      '.shader',
    ])
    expect(parseMasks(undefined)).toEqual([])
    expect(parseMasks('')).toEqual([])
  })

  it('parses custom widths and rejects malformed ones', () => {
    expect(parseViewports('800x600')).toEqual([
      { name: '800x600', width: 800, height: 600 },
    ])
    expect(parseViewports(undefined)).toEqual(DEFAULT_VIEWPORTS)
    expect(() => parseViewports('800')).toThrow(/1440x900/)
  })

  it('turns off the prescroll pass on request', () => {
    expect(parseArgs(['a', 'b', '--no-prescroll']).prescroll).toBe(false)
  })
})

describe('freeze stylesheet', () => {
  it('pins animations and transitions rather than merely slowing them', () => {
    expect(FREEZE_CSS).toMatch(/animation-play-state:\s*paused\s*!important/)
    expect(FREEZE_CSS).toMatch(/animation-duration:\s*0s\s*!important/)
    expect(FREEZE_CSS).toMatch(/transition-duration:\s*0s\s*!important/)
    // A blinking caret is the classic source of a one-pixel-column diff.
    expect(FREEZE_CSS).toMatch(/caret-color:\s*transparent\s*!important/)
  })
})

describe('redactUrl', () => {
  it('strips secret-shaped query values', () => {
    expect(
      redactUrl('https://staging.test/p?x-vercel-protection-bypass=abc123'),
    ).toBe('https://staging.test/p?x-vercel-protection-bypass=REDACTED')
    expect(redactUrl('https://staging.test/p?token=abc&draft=true')).toBe(
      'https://staging.test/p?token=REDACTED&draft=true',
    )
  })

  it('leaves ordinary URLs and non-URLs alone', () => {
    expect(redactUrl('https://a.test/page?draft=true')).toBe(
      'https://a.test/page?draft=true',
    )
    expect(redactUrl('not a url')).toBe('not a url')
  })
})

describe('compareFrames', () => {
  it('reports zero for identical frames', () => {
    const result = compareFrames(frame(4, 4), frame(4, 4))
    expect(result.differing).toBe(0)
    expect(result.percent).toBe(0)
    expect(result.sizeMismatch).toBe(false)
  })

  it('counts a changed pixel as a share of the whole frame', () => {
    const candidate = frame(10, 10)
    setPixel(candidate, 5, 5, [0, 0, 0, 255])

    const result = compareFrames(frame(10, 10), candidate)
    expect(result.differing).toBe(1)
    expect(result.total).toBe(100)
    expect(result.percent).toBe(1)
  })

  it('tolerates an anti-aliasing shade but not a real edge', () => {
    const nudged = frame(10, 10)
    setPixel(nudged, 0, 0, [252, 252, 252, 255])
    expect(compareFrames(frame(10, 10), nudged).differing).toBe(0)

    const moved = frame(10, 10)
    setPixel(moved, 0, 0, [0, 0, 0, 255])
    expect(compareFrames(frame(10, 10), moved).differing).toBe(1)
  })

  it('tightens with a lower pixel threshold', () => {
    const nudged = frame(10, 10)
    setPixel(nudged, 0, 0, [252, 252, 252, 255])
    expect(
      compareFrames(frame(10, 10), nudged, { pixelThreshold: 0 }).differing,
    ).toBe(1)
  })

  it('treats a page that grew as a difference, not something to crop away', () => {
    // A candidate one section taller must fail parity — comparing only the
    // shared area would report a clean run for a page missing content.
    const result = compareFrames(frame(10, 10), frame(10, 20))
    expect(result.sizeMismatch).toBe(true)
    expect(result.height).toBe(20)
    expect(result.total).toBe(200)
    expect(result.differing).toBe(100)
    expect(result.percent).toBe(50)
  })

  it('paints differing pixels magenta over a washed-out baseline', () => {
    const candidate = frame(2, 1)
    setPixel(candidate, 1, 0, [0, 0, 0, 255])

    const { diff } = compareFrames(frame(2, 1), candidate)
    expect([diff[0], diff[1], diff[2], diff[3]]).toEqual([255, 255, 255, 255])
    expect([diff[4], diff[5], diff[6], diff[7]]).toEqual([255, 0, 255, 255])
  })

  it('is symmetric and repeatable', () => {
    const candidate = frame(8, 8)
    setPixel(candidate, 3, 3, [10, 20, 30, 255])
    const forward = compareFrames(frame(8, 8), candidate)
    const backward = compareFrames(candidate, frame(8, 8))
    expect(backward.percent).toBe(forward.percent)
    expect(compareFrames(frame(8, 8), candidate).percent).toBe(forward.percent)
  })
})

describe('verdict', () => {
  const at = (percent: number) => ({ viewport: 'desktop', percent })

  it('passes at or below the threshold and fails above it', () => {
    expect(verdict([at(0)], 0.1).pass).toBe(true)
    expect(verdict([at(0.1)], 0.1).pass).toBe(true)
    expect(verdict([at(0.10001)], 0.1).pass).toBe(false)
  })

  it('fails on the worst width, never on an average', () => {
    const result = verdict(
      [
        { viewport: 'desktop', percent: 0 },
        { viewport: 'mobile', percent: 4 },
      ],
      0.1,
    )
    expect(result.pass).toBe(false)
    expect(result.worst?.viewport).toBe('mobile')
    expect(result.exitCode).toBe(1)
  })

  it('exits nonzero when nothing was captured', () => {
    // An empty run is not a pass: it means no comparison happened.
    expect(verdict([], 0.1)).toMatchObject({ pass: false, exitCode: 1 })
  })

  it('exits zero only on a pass', () => {
    expect(verdict([at(0.05)], 0.1).exitCode).toBe(0)
  })
})

describe('formatSummary', () => {
  const summary = {
    baselineUrl: 'https://a.test/?token=abc',
    candidateUrl: 'https://b.test/home?draft=true',
    threshold: 0.1,
    comparisons: [
      {
        viewport: 'desktop',
        percent: 0.05,
        differing: 5,
        total: 10000,
        width: 1440,
        height: 3000,
        sizeMismatch: false,
      },
      {
        viewport: 'mobile',
        percent: 2.5,
        differing: 250,
        total: 10000,
        width: 390,
        height: 5000,
        sizeMismatch: true,
      },
    ],
  }

  it('reports a verdict per width and overall', () => {
    const text = formatSummary(summary)
    expect(text).toMatch(/PASS {2}desktop/)
    expect(text).toMatch(/FAIL {2}mobile/)
    expect(text).toContain('[size mismatch]')
    expect(text.trimEnd().endsWith('FAIL — above threshold')).toBe(true)
  })

  it('never prints a secret it was handed', () => {
    expect(formatSummary(summary)).not.toContain('token=abc')
    expect(formatSummary(summary)).toContain('token=REDACTED')
  })
})

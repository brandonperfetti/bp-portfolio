// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BYPASS_HEADER,
  BYPASS_TOKEN_ENV,
  DEFAULT_OUT_DIR,
  DEFAULT_PIXEL_THRESHOLD,
  DEFAULT_THRESHOLD_PERCENT,
  DEFAULT_VIEWPORTS,
  FREEZE_CSS,
  MAX_BYPASS_REDIRECTS,
  REDACTED,
  closeCapture,
  compareFrames,
  createRouteState,
  createSafeReporter,
  describeErrorSafely,
  followRedirects,
  hopHeaders,
  formatSummary,
  isTargetOrigin,
  knownBypassTokens,
  carriesToken,
  isUrlSafeToken,
  parseArgs,
  parseMasks,
  parseViewports,
  redactSecret,
  redactUrl,
  redirectTarget,
  routeWithBypass,
  scrubStrings,
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

describe('bypass header scoping (#252)', () => {
  const target = 'https://staging.example.test/about?draft=true'
  const token = 'test-bypass-token'

  it('treats only the exact origin of the captured page as the target', () => {
    expect(
      isTargetOrigin('https://staging.example.test/_next/x.js', target),
    ).toBe(true)
    // URL#origin folds host case and the default port.
    expect(
      isTargetOrigin('https://STAGING.example.test:443/img.png', target),
    ).toBe(true)
    expect(isTargetOrigin('https://res.cloudinary.com/a.png', target)).toBe(
      false,
    )
    expect(
      isTargetOrigin('https://cdn.staging.example.test/a.png', target),
    ).toBe(false)
    expect(isTargetOrigin('https://example.test/a.png', target)).toBe(false)
    expect(isTargetOrigin('http://staging.example.test/a.png', target)).toBe(
      false,
    )
    expect(
      isTargetOrigin('https://staging.example.test:8443/a.png', target),
    ).toBe(false)
    expect(isTargetOrigin('data:image/png;base64,AAAA', target)).toBe(false)
    expect(isTargetOrigin('not a url', target)).toBe(false)
    expect(isTargetOrigin('https://staging.example.test/', 'not a url')).toBe(
      false,
    )
  })

  it('adds the secret on the captured origin and keeps the request headers', () => {
    expect(
      hopHeaders(
        'https://staging.example.test/api/x',
        target,
        { accept: 'text/html', cookie: 'c=1' },
        token,
      ),
    ).toEqual({ accept: 'text/html', cookie: 'c=1', [BYPASS_HEADER]: token })
  })

  it('sends another origin neither the secret nor the deployment credentials', () => {
    const headers = {
      accept: 'text/html',
      Cookie: 'c=1',
      authorization: 'Bearer x',
      'proxy-authorization': 'Basic y',
      [BYPASS_HEADER]: token,
    }
    for (const url of [
      'https://res.cloudinary.com/demo/image/upload/a.png',
      'https://abc.public.blob.vercel-storage.com/a.webp',
      'https://clerk.example.test/v1/client/handshake',
    ]) {
      expect(hopHeaders(url, target, headers, token)).toEqual({
        accept: 'text/html',
      })
    }
  })

  /** A fake response: a status plus response headers. */
  const res = (status: number, headers: Record<string, string> = {}) => ({
    status: () => status,
    headers: () => headers,
  })
  type FakeResponse = ReturnType<typeof res>

  /**
   * A fake same-origin site: a redirect map plus a protected destination that
   * answers 401 without the secret — the shape of a Vercel-protected deploy.
   */
  const site =
    (redirects: Record<string, [number, string]>) =>
    (url: string, headers: Record<string, string>): FakeResponse => {
      const hop = redirects[url]
      if (hop) return res(hop[0], { location: hop[1] })
      return headers[BYPASS_HEADER] === token ? res(200) : res(401)
    }

  /** A Playwright `Route` stand-in that records what the handler did. */
  const stubRoute = (
    url: string,
    serve: (
      url: string,
      headers: Record<string, string>,
    ) => FakeResponse = () => res(200),
    kind: 'subresource' | 'main-frame' | 'iframe' = 'subresource',
  ) => {
    const calls: { method: string; args: unknown[] }[] = []
    return {
      calls,
      route: {
        request: () => ({
          url: () => url,
          method: () => 'GET',
          headers: () => ({ accept: '*/*', cookie: 'session=deployment-only' }),
          postDataBuffer: () => null,
          isNavigationRequest: () => kind !== 'subresource',
          frame: () => ({
            parentFrame: () => (kind === 'iframe' ? {} : null),
          }),
        }),
        continue: async (...args: unknown[]) => {
          calls.push({ method: 'continue', args })
        },
        abort: async (...args: unknown[]) => {
          calls.push({ method: 'abort', args })
        },
        fetch: async (init: {
          url: string
          headers: Record<string, string>
        }) => {
          calls.push({ method: 'fetch', args: [init] })
          return serve(init.url, init.headers)
        },
        fulfill: async (init: { response: FakeResponse }) => {
          calls.push({
            method: 'fulfill',
            args: [{ status: init.response.status() }],
          })
        },
      },
    }
  }

  /** The URLs a stub route fetched, in order, and whether each carried the secret. */
  const fetched = (calls: { method: string; args: unknown[] }[]) =>
    calls
      .filter((c) => c.method === 'fetch')
      .map((c) => {
        const init = c.args[0] as {
          url: string
          headers: Record<string, string>
          maxRedirects: number
        }
        expect(init.maxRedirects).toBe(0)
        const secret = init.headers[BYPASS_HEADER] === token ? 'SECRET' : 'none'
        const cookie = Object.keys(init.headers).some(
          (name) => name.toLowerCase() === 'cookie',
        )
          ? ' +cookie'
          : ''
        return `${init.url} ${secret}${cookie}`
      })

  it('continues a cross-origin request with no header override', async () => {
    const stub = stubRoute('https://res.cloudinary.com/a.png')
    await routeWithBypass(stub.route, target, token)
    expect(stub.calls).toEqual([{ method: 'continue', args: [] }])
    expect(JSON.stringify(stub.calls)).not.toContain(token)
  })

  it('carries the secret through every same-origin redirect hop to a protected destination', async () => {
    // Playwright never routes a hop the browser follows itself, so a
    // fulfilled 302 would reach /dest headerless and capture the 401 page
    // (measured, CodeRabbit on PR #259). Each hop is fetched here instead.
    const base = 'https://staging.example.test'
    const stub = stubRoute(
      `${base}/articles/old-slug`,
      site({
        [`${base}/articles/old-slug`]: [308, '/topics/web/old-slug'],
        [`${base}/topics/web/old-slug`]: [302, `${base}/topics/web/new-slug`],
      }),
    )
    await routeWithBypass(stub.route, target, token)
    // The browser's cookie rides the first hop only; later hops take the
    // context's jar (see the Set-Cookie test under `redirect following`).
    expect(fetched(stub.calls)).toEqual([
      `${base}/articles/old-slug SECRET +cookie`,
      `${base}/topics/web/old-slug SECRET`,
      `${base}/topics/web/new-slug SECRET`,
    ])
    expect(stub.calls.at(-1)).toEqual({
      method: 'fulfill',
      args: [{ status: 200 }],
    })
  })

  it('walks an off-site round trip — the third party gets no secret or cookie, the way back gets the secret', async () => {
    // Clerk's handshake shape: the page 307s to Clerk's domain, which 307s
    // back. A browser-followed hop is never routed, so the way back would
    // reach the deployment without the secret; every hop is fetched here.
    const base = 'https://staging.example.test'
    const clerk = 'https://clerk.example.test/v1/client/handshake'
    const stub = stubRoute(
      `${base}/page`,
      site({
        [`${base}/page`]: [307, `${clerk}?redirect_url=x`],
        [`${clerk}?redirect_url=x`]: [307, `${base}/page?__clerk_db_jwt=j`],
        [`${base}/page?__clerk_db_jwt=j`]: [307, `${base}/page-2`],
      }),
    )
    await routeWithBypass(stub.route, target, token)
    expect(fetched(stub.calls)).toEqual([
      `${base}/page SECRET +cookie`,
      `${clerk}?redirect_url=x none`,
      `${base}/page?__clerk_db_jwt=j SECRET`,
      `${base}/page-2 SECRET`,
    ])
    expect(stub.calls.at(-1)).toEqual({
      method: 'fulfill',
      args: [{ status: 200 }],
    })
  })

  it('reports where a redirected main-frame navigation ended, and nothing else', async () => {
    const base = 'https://staging.example.test'
    const serve = site({ [`${base}/a/vary`]: [302, '/b/dest'] })
    const seen: string[] = []
    const record = (finalUrl: string) => seen.push(finalUrl)

    await routeWithBypass(
      stubRoute(`${base}/a/vary`, serve, 'main-frame').route,
      target,
      token,
      record,
    )
    expect(seen).toEqual([`${base}/b/dest`])

    // A redirected image or iframe keeps its URL; a direct hit reports nothing.
    await routeWithBypass(
      stubRoute(`${base}/a/vary`, serve).route,
      target,
      token,
      record,
    )
    await routeWithBypass(
      stubRoute(`${base}/a/vary`, serve, 'iframe').route,
      target,
      token,
      record,
    )
    await routeWithBypass(
      stubRoute(`${base}/b/dest`, serve, 'main-frame').route,
      target,
      token,
      record,
    )
    expect(seen).toEqual([`${base}/b/dest`])
  })

  it('aborts a same-origin redirect loop after the hop cap', async () => {
    const base = 'https://staging.example.test'
    const stub = stubRoute(
      `${base}/a`,
      site({ [`${base}/a`]: [302, '/b'], [`${base}/b`]: [302, '/a'] }),
    )
    await routeWithBypass(stub.route, target, token)
    expect(fetched(stub.calls)).toHaveLength(MAX_BYPASS_REDIRECTS + 1)
    expect(stub.calls.at(-1)).toEqual({ method: 'abort', args: ['failed'] })
  })

  it('records a redirect-loop abort as a capture failure, redacted, unless closing', async () => {
    const base = 'https://staging.example.test'
    const loop = () =>
      stubRoute(
        `${base}/a`,
        site({ [`${base}/a`]: [302, '/b'], [`${base}/b`]: [302, '/a'] }),
      )

    const running = createRouteState()
    await routeWithBypass(loop().route, target, token, undefined, running)
    expect(running.failures).toHaveLength(1)
    expect(running.failures[0]).toContain(
      `passed ${MAX_BYPASS_REDIRECTS} hops: ${base}/a`,
    )
    expect(running.failures[0]).not.toContain(token)

    const closing = createRouteState()
    closing.closing = true
    await routeWithBypass(loop().route, target, token, undefined, closing)
    expect(closing.failures).toEqual([])
  })
})

describe('redirect following (#252)', () => {
  const target = 'https://staging.example.test/'
  const token = 'test-bypass-token'

  it('reads a followable Location, relative or absolute', () => {
    const r = (status: number, location?: string) => ({
      status: () => status,
      headers: () => (location ? { location } : {}),
    })
    expect(redirectTarget(r(302, '/x?y=1'), 'https://a.test/p/q')).toBe(
      'https://a.test/x?y=1',
    )
    expect(redirectTarget(r(308, 'https://b.test/'), 'https://a.test/')).toBe(
      'https://b.test/',
    )
    expect(redirectTarget(r(304, '/x'), 'https://a.test/')).toBeNull()
    expect(redirectTarget(r(200, '/x'), 'https://a.test/')).toBeNull()
    expect(redirectTarget(r(302), 'https://a.test/')).toBeNull()
  })

  it('lets a cookie set on one hop reach the next, instead of re-sending the stale one', async () => {
    // Playwright sends an explicit `cookie` header in place of the context's
    // jar, and a hop's Set-Cookie lands in that jar (playwright-core 1.61.1;
    // measured in Chromium, CodeRabbit on PR #271). This fake fetch models
    // exactly that. The site sets `v=2` and redirects back to itself, like a
    // Clerk handshake return: re-sending the browser's `v=1` looped it to the
    // cap.
    const jar = new Map([['v', '1']])
    const seen: string[] = []
    const result = await followRedirects(
      async (url: string, init: { headers: Record<string, string> }) => {
        const explicit = Object.entries(init.headers).find(
          ([name]) => name.toLowerCase() === 'cookie',
        )?.[1]
        const cookie =
          explicit ??
          [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
        seen.push(`${url} ${cookie}`)
        if (cookie === 'v=2') return { status: () => 200, headers: () => ({}) }
        jar.set('v', '2')
        return { status: () => 302, headers: () => ({ location: url }) }
      },
      {
        url: 'https://staging.example.test/start',
        headers: { accept: 'text/html', Cookie: 'v=1' },
      },
      target,
      token,
    )
    expect(seen).toEqual([
      'https://staging.example.test/start v=1',
      'https://staging.example.test/start v=2',
    ])
    expect(result).toMatchObject({ stop: 'final' })
  })

  it('re-issues a 303 (and a 301/302 after POST) as a GET without a body', async () => {
    const seen: string[] = []
    const result = await followRedirects(
      async (url: string, init: { method: string; postData?: unknown }) => {
        seen.push(`${init.method} ${url} ${init.postData ? 'body' : 'nobody'}`)
        if (url.endsWith('/form')) {
          return { status: () => 303, headers: () => ({ location: '/done' }) }
        }
        return { status: () => 200, headers: () => ({}) }
      },
      {
        url: 'https://staging.example.test/form',
        method: 'POST',
        headers: {},
        postData: 'a=1',
      },
      target,
      token,
    )
    expect(seen).toEqual([
      'POST https://staging.example.test/form body',
      'GET https://staging.example.test/done nobody',
    ])
    expect(result).toMatchObject({
      url: 'https://staging.example.test/done',
      stop: 'final',
    })
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

describe('teardown and error output never print the bypass secret (#273)', () => {
  // A fixture value, never the real secret.
  const token = 'fixture-bypass-0123456789abcdef'
  const target = 'https://staging.example.test/'

  /** Count fixed-string occurrences without printing the haystack. */
  const occurrences = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1

  /**
   * The shape Playwright rejects `route.fetch` with once its context is
   * closed: the message carries a call log that prints request headers raw,
   * and the same lines sit in a `log` array that Node's inspector prints.
   */
  const playwrightError = () => {
    const log = [
      `→ GET ${target}_next/static/chunk.js`,
      `  ${BYPASS_HEADER}: ${token}`,
      '  accept: */*',
    ]
    const error = new Error(
      `apiRequestContext._wrapApiCall: Target page, context or browser has been closed\nCall log:\n${log.map((line) => `  - ${line}`).join('\n')}`,
    ) as Error & { log: string[] }
    error.name = 'Error'
    error.log = log
    return error
  }

  /** Everything printed through `console`, joined. */
  const captureConsole = () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    )
    return () =>
      spies
        .flatMap((spy) => spy.mock.calls.flat())
        .map((arg) =>
          typeof arg === 'string' ? arg : JSON.stringify(arg, null, 0),
        )
        .join('\n')
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A same-origin route whose fetch rejects as it does after close. */
  const closedRoute = (abortThrows = false) => {
    const calls: string[] = []
    return {
      calls,
      route: {
        request: () => ({
          url: () => `${target}_next/static/chunk.js`,
          method: () => 'GET',
          headers: () => ({ accept: '*/*' }),
          postDataBuffer: () => null,
          isNavigationRequest: () => false,
          frame: () => ({ parentFrame: () => null }),
        }),
        continue: async () => {
          calls.push('continue')
        },
        fetch: async () => {
          calls.push('fetch')
          throw playwrightError()
        },
        fulfill: async () => {
          calls.push('fulfill')
        },
        abort: async () => {
          calls.push('abort')
          if (abortThrows) throw playwrightError()
        },
      },
    }
  }

  it('settles a route whose fetch rejects after close, printing nothing', async () => {
    const printed = captureConsole()
    const { calls, route } = closedRoute()

    await expect(
      routeWithBypass(route as never, target, token),
    ).resolves.toBeUndefined()

    expect(calls).toEqual(['fetch', 'abort'])
    expect(occurrences(printed(), token)).toBe(0)
    expect(printed()).toBe('')
  })

  it('also settles when aborting the closed request throws', async () => {
    const printed = captureConsole()
    const { calls, route } = closedRoute(true)

    await expect(
      routeWithBypass(route as never, target, token),
    ).resolves.toBeUndefined()

    expect(calls).toEqual(['fetch', 'abort'])
    expect(printed()).toBe('')
  })

  it('describes a Playwright-shaped error with zero occurrences of the token', () => {
    const text = describeErrorSafely(playwrightError(), token)

    expect(occurrences(text, token)).toBe(0)
    expect(text).toContain(`${BYPASS_HEADER}: ${REDACTED}`)
    // The useful part survives.
    expect(text).toContain('Target page, context or browser has been closed')
    // The `log` array and stack are not part of the description.
    expect(occurrences(text, 'accept: */*')).toBe(1)
  })

  it('redacts a bypass header value it was not told about', () => {
    const other = 'some-other-bypass-value'
    for (const line of [
      `${BYPASS_HEADER}: ${other}`,
      `"${BYPASS_HEADER}":"${other}"`,
      `${BYPASS_HEADER.toUpperCase()}=${other}`,
    ]) {
      expect(occurrences(redactSecret(line, token), other)).toBe(0)
    }
    expect(redactSecret('nothing secret here', token)).toBe(
      'nothing secret here',
    )
  })

  it('describes thrown non-errors without crashing', () => {
    expect(describeErrorSafely(`bad ${token}`, token)).toBe(
      `Error: bad ${REDACTED}`,
    )
    expect(describeErrorSafely(undefined, token)).toBe('Error: undefined')
  })

  it('unroutes, ignoring errors, before it closes the context', async () => {
    const order: unknown[] = []
    await closeCapture({
      unrouteAll: async (options: unknown) => {
        order.push(['unrouteAll', options])
      },
      close: async () => {
        order.push('close')
      },
    })
    expect(order).toEqual([
      ['unrouteAll', { behavior: 'ignoreErrors' }],
      'close',
    ])
  })

  it('records a fetch that fails while the capture runs, redacted', async () => {
    const printed = captureConsole()
    const { calls, route } = closedRoute()
    const state = createRouteState()

    await routeWithBypass(route as never, target, token, undefined, state)

    expect(calls).toEqual(['fetch', 'abort'])
    expect(state.failures).toHaveLength(1)
    expect(occurrences(state.failures[0], token)).toBe(0)
    expect(state.failures[0]).toContain(`${BYPASS_HEADER}: ${REDACTED}`)
    expect(printed()).toBe('')
  })

  it('drops a fetch that fails once the capture is closing', async () => {
    const { calls, route } = closedRoute()
    const state = createRouteState()
    state.closing = true

    await routeWithBypass(route as never, target, token, undefined, state)

    expect(calls).toEqual(['fetch', 'abort'])
    expect(state.failures).toEqual([])
  })

  it('ignores a fulfill the browser has already discarded', async () => {
    const printed = captureConsole()
    const calls: string[] = []
    const { route } = closedRoute()
    const state = createRouteState()
    const live = {
      ...route,
      fetch: async () => {
        calls.push('fetch')
        return { status: () => 200, headers: () => ({}) }
      },
      fulfill: async () => {
        calls.push('fulfill')
        throw playwrightError()
      },
    }

    await expect(
      routeWithBypass(live as never, target, token, undefined, state),
    ).resolves.toBeUndefined()

    expect(calls).toEqual(['fetch', 'fulfill'])
    expect(state.failures).toEqual([])
    expect(printed()).toBe('')
  })

  it('marks the route state closing before it unroutes', async () => {
    const state = createRouteState()
    const seen: boolean[] = []
    await closeCapture(
      {
        unrouteAll: async () => {
          seen.push(state.closing)
        },
        close: async () => {},
      },
      state,
    )
    expect(seen).toEqual([true])
  })

  it('knows the token from the environment and from every flag', () => {
    expect(
      knownBypassTokens(['a', `--bypass-token=${token}`, '--bypass-token='], {
        [BYPASS_TOKEN_ENV]: 'from-env',
      }),
    ).toEqual(['from-env', token])
    expect(knownBypassTokens([], {})).toEqual([])
  })

  it('reports a fatal error redacted, and keeps the exit failed after it', () => {
    const lines: string[] = []
    const reporter = createSafeReporter(
      [token, 'second-value', undefined],
      (line) => lines.push(line),
    )

    expect(reporter.exitCode(0)).toBe(0)
    expect(
      reporter.scrub(`a ${token} b second-value c ${BYPASS_HEADER}: other`),
    ).toBe(`a ${REDACTED} b ${REDACTED} c ${BYPASS_HEADER}: ${REDACTED}`)

    reporter.fail(playwrightError())
    reporter.fail(new Error('second-value leaked'))

    expect(lines).toHaveLength(2)
    expect(lines.every((line) => line.startsWith('diff-pages: '))).toBe(true)
    expect(occurrences(lines.join('\n'), token)).toBe(0)
    expect(occurrences(lines.join('\n'), 'second-value')).toBe(0)
    // Sticky: a passing verdict computed after a fatal error is not a pass.
    expect(reporter.exitCode(0)).toBe(2)
    expect(reporter.exitCode(1)).toBe(2)
  })

  it.each([
    [
      'the environment',
      (env: NodeJS.ProcessEnv) => ({ ...env, [BYPASS_TOKEN_ENV]: token }),
      [],
    ],
    ['the flag', (env: NodeJS.ProcessEnv) => env, [`--bypass-token=${token}`]],
  ])(
    'prints no token in a usage error when it comes from %s',
    (_label, withToken, extraArgs) => {
      // The reviewer's repro: the token pasted into a flag that echoes its
      // value. Loopback URLs; parsing fails before any browser starts.
      const { [BYPASS_TOKEN_ENV]: _drop, ...env } = process.env
      const child = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../diff-pages.mjs', import.meta.url)),
          'http://127.0.0.1:9/',
          'http://127.0.0.1:9/',
          `--widths=${token}`,
          ...extraArgs,
        ],
        { env: withToken(env), encoding: 'utf8', timeout: 30_000 },
      )

      expect(child.status).toBe(2)
      expect(child.stderr).toContain('diff-pages: ')
      expect(occurrences(`${child.stdout}${child.stderr}`, token)).toBe(0)
    },
    30_000,
  )

  it('scrubs report values before serializing, so JSON escaping cannot hide a token', () => {
    // A token holding the two characters JSON escapes.
    const awkward = 'tok"en\\with-escapes'
    const { scrub } = createSafeReporter([awkward], () => {})
    const summary = {
      baselineUrl: 'https://staging.example.test/',
      comparisons: [{ diffImage: `/tmp/${awkward}/desktop-diff.png` }],
    }

    // The defect: scrubbing the serialized text misses the escaped form.
    const naive = scrub(JSON.stringify(summary))
    expect(JSON.parse(naive).comparisons[0].diffImage).toContain(awkward)

    const text = JSON.stringify(scrubStrings(summary, scrub))
    expect(JSON.parse(text).comparisons[0].diffImage).toBe(
      `/tmp/${REDACTED}/desktop-diff.png`,
    )
    expect(occurrences(text, awkward)).toBe(0)
    expect(JSON.parse(text).baselineUrl).toBe(summary.baselineUrl)
  })

  it('redacts a whole token that holds a quote, even inside a bypass header', () => {
    // The header pass stops at `"`. Run before the literal pass, it turned
    // `tok"en\with-escapes` into `REDACTED"en\with-escapes` (CodeRabbit, PR #336).
    const awkward = 'tok"en\\with-escapes'
    const lines: string[] = []
    const reporter = createSafeReporter(
      ['other-known-value', awkward],
      (line) => lines.push(line),
    )

    expect(reporter.scrub(`${BYPASS_HEADER}: ${awkward}`)).toBe(
      `${BYPASS_HEADER}: ${REDACTED}`,
    )

    const error = new Error(`call log:\n  - ${BYPASS_HEADER}: ${awkward}\n`)
    reporter.fail(error)
    expect(lines).toEqual([
      `diff-pages: Error: call log:\n  - ${BYPASS_HEADER}: ${REDACTED}\n`,
    ])
    expect(describeErrorSafely(error, [awkward])).toBe(
      `Error: call log:\n  - ${BYPASS_HEADER}: ${REDACTED}\n`,
    )
  })

  // Every value a reviewer or CodeRabbit used to slip an encoded token past
  // the scrub on PR #336: a quote, space, `?`, `'`, `$`, `;`, `:`, non-ASCII
  // (a punycode host), a trailing space, `/`, `%`, a lone surrogate.
  const refusedTokens = [
    'tok"en with space',
    'tok"en?with space',
    "tok'! with space",
    'tok$en;space',
    'tok$en:space',
    'töken',
    'tok?en ',
    'tok/en',
    'tok%22en',
    'tok\uD800en',
    // `~` is unreserved, but URLSearchParams writes it as %7E.
    'tok~en',
    // Dots alone are a path segment `new URL` removes.
    '..',
    // No letter outside a-f and x: a host reads these as IPv4 addresses
    // (`2130706433` prints as 127.0.0.1, re-review 6).
    '2130706433',
    '0x7f000001',
    '127.0.0.1',
    'abcdef0123',
  ]

  it.each(refusedTokens)(
    'refuses the bypass value %j before anything runs, without quoting it',
    (bad) => {
      const urls = ['https://a.example.test/', 'https://b.example.test/']
      for (const [argv, env] of [
        [urls, { [BYPASS_TOKEN_ENV]: bad }],
        [[...urls, `--bypass-token=${bad}`], {}],
      ] as const) {
        let message = ''
        try {
          parseArgs([...argv], env)
        } catch (error) {
          message = (error as Error).message
        }
        expect(message).toContain('is refused')
        expect(occurrences(message, bad)).toBe(0)
      }
    },
  )

  it('accepts a bypass value of unreserved characters only', () => {
    const good = 'AbC123._-xyz'
    const options = parseArgs(
      ['https://a.example.test/', 'https://b.example.test/'],
      {
        [BYPASS_TOKEN_ENV]: good,
      },
    )
    expect(options.bypassToken).toBe(good)
  })

  it.each([
    // Re-review 6's rows: URL parsing rewrites what surrounds the value.
    ['tok.en9z', 'https://tok.en9z\u00f6.example.test/'],
    ['65cretdummy9z', 'https://%65cretdummy9z.example.test/'],
    ['65cretdummy9z', 'https://example.test/?page=%65cretdummy9z&api_key=x'],
    ['Dummy9Z', 'https://example.test/%44ummy9Z/'],
    ['Dummy9Z', 'https://example.test/%2544ummy9Z/'],
    // Full-width letters, which a host's IDNA mapping turns into ASCII.
    [
      'Dummy9Z',
      'https://\uff44\uff55\uff4d\uff4d\uff59\uff19\uff5a.example.test/',
    ],
    ['Dummy9Z', 'https://user:DUMMY9z@example.test/'],
    // The URL parser drops a tab, completing `%44` only after parsing.
    ['Dummy9Z', 'https://example.test/%4\t4ummy9Z/'],
    // IDNA mapping drops a soft hyphen; punycode then splits the label.
    ['tok.en9z', 'https://tok.en\u00ad9z\u00f6.example.test/'],
  ])(
    'refuses a URL argument that carries the bypass value %j, without quoting it',
    (good, url) => {
      expect(isUrlSafeToken(good)).toBe(true)
      expect(carriesToken(url, good)).toBe(true)
      let message = ''
      try {
        parseArgs([url, 'https://b.example.test/'], {
          [BYPASS_TOKEN_ENV]: good,
        })
      } catch (error) {
        message = (error as Error).message
      }
      expect(message).toContain('carries the bypass secret')
      expect(occurrences(message.toLowerCase(), good.toLowerCase())).toBe(0)
    },
  )

  it('accepts URL arguments that do not carry the bypass value', () => {
    const good = 'Dummy9Z'
    expect(carriesToken('https://example.test/?page=%44ummy', good)).toBe(false)
    const options = parseArgs(
      ['https://a.example.test/', 'https://b.example.test/?q=dummy'],
      { [BYPASS_TOKEN_ENV]: good },
    )
    expect(options.baselineUrl).toBe('https://a.example.test/')
  })

  it('redacts an accepted token in every URL component a printed URL can carry it', () => {
    // Unreserved characters print unchanged in every component; a host
    // lowercases them, which the case-insensitive match covers.
    const good = 'Tok.en_-9Z'
    const { scrub } = createSafeReporter([good], () => {})
    const inputs = [
      `https://${good}@example.test/`,
      `https://user:${good}@example.test/`,
      `https://${good}.example.test/`,
      `https://example.test/${good}/tail`,
      `https://example.test/?page=${good}&other=1`,
      `https://example.test/?page=${good}&api_key=x`,
      `https://example.test/#${good}/tail`,
    ]
    for (const input of inputs) {
      const printed = redactUrl(input)
      for (const out of [
        scrub(printed),
        JSON.parse(JSON.stringify(scrubStrings({ url: printed }, scrub))).url,
      ]) {
        expect(out).toContain(REDACTED)
        expect(decodeURIComponent(out).toLowerCase()).not.toContain(
          good.toLowerCase(),
        )
      }
    }
  })

  it('refuses a URL argument carrying the secret at the CLI with exit 2', () => {
    const good = 'Dummy9Z-fixture'
    const { [BYPASS_TOKEN_ENV]: _drop, ...env } = process.env
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../diff-pages.mjs', import.meta.url)),
        'http://127.0.0.1:9/',
        `http://127.0.0.1:9/?page=${good}`,
      ],
      {
        env: { ...env, [BYPASS_TOKEN_ENV]: good },
        encoding: 'utf8',
        timeout: 30_000,
      },
    )
    expect(child.status).toBe(2)
    expect(child.stderr).toContain('carries the bypass secret')
    expect(occurrences(`${child.stdout}${child.stderr}`, good)).toBe(0)
  }, 30_000)

  it('refuses a bad bypass value at the CLI with exit 2 and no output of it', () => {
    const bad = 'tok"en?with space'
    const { [BYPASS_TOKEN_ENV]: _drop, ...env } = process.env
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../diff-pages.mjs', import.meta.url)),
        'http://127.0.0.1:9/',
        `http://127.0.0.1:9/?page=${bad}`,
      ],
      {
        env: { ...env, [BYPASS_TOKEN_ENV]: bad },
        encoding: 'utf8',
        timeout: 30_000,
      },
    )
    expect(child.status).toBe(2)
    expect(child.stderr).toContain('is refused')
    expect(occurrences(`${child.stdout}${child.stderr}`, bad)).toBe(0)
  }, 30_000)

  it('redacts a lone-surrogate value given to the reporter without throwing', () => {
    const loneSurrogate = 'tok\uD800en'
    expect(redactSecret(`x ${loneSurrogate} y`, loneSurrogate)).toBe(
      `x ${REDACTED} y`,
    )
  })

  it('leaves a plain alphanumeric token to the literal match alone', () => {
    expect(redactSecret('x AbC123 y', 'AbC123')).toBe(`x ${REDACTED} y`)
    expect(redactSecret('nothing here', 'AbC123')).toBe('nothing here')
  })

  it('redacts the longer of two overlapping tokens whole', () => {
    expect(redactSecret('a abc-long b', ['abc', 'abc-long'])).toBe(
      `a ${REDACTED} b`,
    )
  })
})

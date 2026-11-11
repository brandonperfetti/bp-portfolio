import { expect, test, type APIRequestContext } from '@playwright/test'
import sharp from 'sharp'

/**
 * The two server-side image pipelines, as HTTP requests to a real `next start`
 * (no browser page): the Node `next/og` card behind both `/api/og/*` routes,
 * and the built-in image optimizer behind `/_next/image`, whose resizing and
 * re-encoding run in sharp. A Next or sharp upgrade (#313) that breaks either
 * one fails here. Every image body is fully decoded to pixels with sharp,
 * because `metadata()` reads only the header and would pass an image whose
 * compressed data is corrupt.
 *
 * Unit tests cannot cover this: from 16.4, Next's `ImageResponse` loads React
 * server modules that exist only inside Next's own runtime.
 *
 * The refusals are pinned too. With `images.dangerouslyAllowSVG` unset, an SVG
 * source reaches the optimizer's type check and is refused there, before sharp
 * rasterises anything. `localPatterns` and the size lists refuse anything else.
 * None of these requests sends hostile input; each one only asserts the
 * refusal.
 *
 * Both pipelines need the deterministic `pnpm seed:e2e` fixtures
 * (`scripts/seed-e2e.ts`: the `POSTS` article, the `about` page and the avatar
 * media row). As in `article-discovery.spec.ts`, a missing fixture **fails**
 * under `CI` and skips with {@link SKIP_REASON} otherwise.
 */

/** A seeded article: the article OG route renders it by slug. */
const ARTICLE_SLUG = 'react-server-components-in-practice'

/** A seeded page: the page OG route renders it by path. */
const PAGE_PATH = 'about'

/** Prefix of the seeded avatar's stored filename: `seed-e2e.ts` names uploads `e2e-<stem>-<hash>`. */
const AVATAR_PREFIX = 'e2e-avatar'

const SKIP_REASON =
  'og-and-image-optimizer: seeded e2e fixtures absent (run `pnpm seed:e2e`); this run proves nothing about either pipeline.'

/** Skip locally, fail under CI, when a seeded fixture is missing. */
function requireSeeded(present: boolean) {
  if (present) return
  if (process.env.CI) throw new Error(SKIP_REASON)
  test.skip(true, SKIP_REASON)
}

/** `/_next/image` URL for a same-origin source. */
function optimizerUrl(src: string, width: number) {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`
}

/** The seeded avatar's served URL, or null when the corpus lacks it. */
async function avatarUrl(request: APIRequestContext) {
  const res = await request.get(
    `/api/media?depth=0&limit=1&where[filename][like]=${AVATAR_PREFIX}`,
  )
  if (!res.ok()) return null
  const body = (await res.json()) as { docs?: { url?: string }[] }
  return body.docs?.[0]?.url ?? null
}

/**
 * Header facts plus a full decode. The decode rejects on corrupt compressed
 * data, and its own dimensions are the ones asserted.
 */
async function decode(bytes: Buffer) {
  const meta = await sharp(bytes).metadata()
  const { data, info } = await sharp(bytes)
    .raw()
    .toBuffer({ resolveWithObject: true })
  expect(data.length).toBe(info.width * info.height * info.channels)
  expect(data.length).toBeGreaterThan(0)
  return { meta, width: info.width, height: info.height }
}

test.describe('next/og card', () => {
  for (const [route, path] of [
    ['article', `/api/og/article/${ARTICLE_SLUG}`],
    ['page', `/api/og/page/${PAGE_PATH}`],
  ] as const) {
    test(`renders a seeded ${route} as a decodable 1200×630 PNG`, async ({
      request,
    }) => {
      const res = await request.get(path)
      requireSeeded(res.status() !== 404)

      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toBe('image/png')
      const { meta, width, height } = await decode(await res.body())
      expect(meta.format).toBe('png')
      expect({ width, height }).toEqual({ width: 1200, height: 630 })
    })
  }

  test('404s an unknown slug or path instead of drawing a card', async ({
    request,
  }) => {
    for (const path of [
      '/api/og/article/no-such-article-313',
      '/api/og/page/no-such-page-313',
    ]) {
      const res = await request.get(path)
      expect(res.status(), path).toBe(404)
      expect(res.headers()['content-type'], path).not.toContain('image/')
    }
  })
})

test.describe('image optimizer', () => {
  test('re-encodes a seeded upload to the negotiated format and width', async ({
    request,
  }) => {
    const src = await avatarUrl(request)
    requireSeeded(src !== null)

    for (const { accept, type, format, compression } of [
      {
        accept: 'image/avif,image/webp,*/*',
        type: 'image/avif',
        format: 'heif',
        // HEIF is the container family; AV1 is what makes it AVIF.
        compression: 'av1',
      },
      { accept: 'image/webp,*/*', type: 'image/webp', format: 'webp' },
    ] as const) {
      const res = await request.get(optimizerUrl(src!, 256), {
        headers: { accept },
      })
      expect(res.status(), accept).toBe(200)
      expect(res.headers()['content-type'], accept).toBe(type)
      const { meta, width } = await decode(await res.body())
      expect(meta.format, accept).toBe(format)
      if (compression) expect(meta.compression, accept).toBe(compression)
      expect(width, accept).toBe(256)
    }
  })

  test('refuses an SVG source before sharp rasterises it', async ({
    request,
  }) => {
    const res = await request.get(optimizerUrl('/images/cms/banner.svg', 256), {
      headers: { accept: 'image/avif,image/webp,*/*' },
    })

    expect(res.status()).toBe(400)
    expect(await res.text()).toContain('image type is not allowed')
  })

  test('refuses a source outside localPatterns and an unlisted width', async ({
    request,
  }) => {
    const outside = await request.get(
      optimizerUrl('/assets/favicons/android-chrome-512x512.png', 256),
    )
    expect(outside.status()).toBe(400)
    expect(await outside.text()).toContain('"url" parameter is not allowed')

    const src = await avatarUrl(request)
    requireSeeded(src !== null)
    const width = await request.get(optimizerUrl(src!, 257))
    expect(width.status()).toBe(400)
    expect(await width.text()).toContain('"w" parameter (width)')
  })
})

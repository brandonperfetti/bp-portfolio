import { expect, test, type APIRequestContext } from '@playwright/test'
import sharp from 'sharp'

/**
 * The two server-side image pipelines, end to end on a real `next start`:
 * the Node `next/og` card behind `/api/og/*`, and the built-in image
 * optimizer behind `/_next/image`, whose resizing and re-encoding run in
 * sharp. A Next or sharp upgrade (#313) that breaks either one fails here.
 * The bytes are checked by decoding them with sharp, not by a content-type
 * header alone.
 *
 * Unit tests cannot cover this: from 16.4, Next's `ImageResponse` loads React
 * server modules that exist only inside Next's own runtime.
 *
 * The refusals are pinned too. With `images.dangerouslyAllowSVG` unset, an
 * SVG source never reaches the optimizer. `localPatterns` and the size lists
 * reject anything else. None of these requests sends hostile input; each one
 * only asserts the refusal.
 *
 * Both pipelines need the deterministic `pnpm seed:e2e` fixtures
 * (`scripts/seed-e2e.ts`: the `POSTS` article and the avatar media row). As
 * in `article-discovery.spec.ts`, a missing fixture **fails** under `CI` and
 * skips with {@link SKIP_REASON} otherwise.
 */

/** A seeded article: the OG card route renders it by slug. */
const ARTICLE_SLUG = 'react-server-components-in-practice'

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

test.describe('next/og card', () => {
  test('renders a seeded article as a 1200×630 PNG', async ({ request }) => {
    const res = await request.get(`/api/og/article/${ARTICLE_SLUG}`)
    requireSeeded(res.status() !== 404)

    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('image/png')
    const meta = await sharp(await res.body()).metadata()
    expect(meta.format).toBe('png')
    expect({ width: meta.width, height: meta.height }).toEqual({
      width: 1200,
      height: 630,
    })
  })

  test('404s an unknown slug instead of drawing a card', async ({
    request,
  }) => {
    const res = await request.get('/api/og/article/no-such-article-313')

    expect(res.status()).toBe(404)
    expect(res.headers()['content-type']).not.toContain('image/')
  })
})

test.describe('image optimizer', () => {
  test('re-encodes a seeded upload to the negotiated format and width', async ({
    request,
  }) => {
    const src = await avatarUrl(request)
    requireSeeded(src !== null)

    for (const [accept, format] of [
      ['image/avif,image/webp,*/*', 'heif'],
      ['image/webp,*/*', 'webp'],
    ] as const) {
      const res = await request.get(optimizerUrl(src!, 256), {
        headers: { accept },
      })
      expect(res.status(), accept).toBe(200)
      const meta = await sharp(await res.body()).metadata()
      expect(meta.format, accept).toBe(format)
      expect(meta.width, accept).toBe(256)
    }
  })

  test('refuses an SVG source: SVG is never rasterised', async ({
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

    const src = await avatarUrl(request)
    requireSeeded(src !== null)
    const width = await request.get(optimizerUrl(src!, 257))
    expect(width.status()).toBe(400)
  })
})

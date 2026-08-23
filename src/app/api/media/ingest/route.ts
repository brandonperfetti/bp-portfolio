import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

export const maxDuration = 60

/** Hosts the ingest route is willing to fetch from (SSRF guard). */
const ALLOWED_SOURCE_HOSTS = new Set(['res.cloudinary.com'])

/** Mirrors the Media collection's 12MB upload ceiling. */
const MAX_BYTES = 12 * 1024 * 1024

const ALLOWED_MIME_PREFIX = 'image/'

/**
 * Derive a stable filename from a source URL path, e.g.
 * `.../bp-portfolio/images/articles/my-post/cover-B.png` →
 * `my-post-cover-B.png`.
 */
function filenameFromUrl(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean)
  const tail = segments.slice(-2).join('-') || 'ingested-image'
  return tail.replace(/[^a-zA-Z0-9._-]/g, '-')
}

/**
 * Agent-facing media ingestion: fetch an image from an allowlisted host
 * (Cloudinary) server-side and create a Payload Media doc from it, so
 * connector-driven content runs can attach hero images without a browser.
 *
 * @remarks Exists because the MCP connector cannot upload files —
 * `createMedia` requires multipart data and the admin "Paste URL" flow is a
 * client-side fetch. This route is the server-side equivalent: POST
 * `{ secret, url, alt }` → Media doc in Blob → `{ id, url, filename }`.
 * Auth reuses `CMS_REVALIDATE_SECRET` (same trust level as the revalidate
 * route: agent ops, never public). Deliberately NOT rate-limited: the
 * secret gate already restricts callers to trusted automation, and a
 * limit here would only throttle our own content runs. The host allowlist is deliberate SSRF
 * hygiene — widen `ALLOWED_SOURCE_HOSTS` only for hosts we control.
 */
export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!isValidSecret(body?.secret, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const alt = typeof body?.alt === 'string' ? body.alt.trim() : ''
  if (!alt) {
    return NextResponse.json(
      { ok: false, error: 'alt is required' },
      { status: 400 },
    )
  }

  let sourceUrl: URL
  try {
    sourceUrl = new URL(String(body?.url ?? ''))
  } catch {
    return NextResponse.json(
      { ok: false, error: 'url is not a valid URL' },
      { status: 400 },
    )
  }

  if (
    sourceUrl.protocol !== 'https:' ||
    !ALLOWED_SOURCE_HOSTS.has(sourceUrl.host)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `url host must be one of: ${[...ALLOWED_SOURCE_HOSTS].join(', ')}`,
      },
      { status: 400 },
    )
  }

  // redirect: 'error' — the https+allowlist check above runs on the FIRST
  // hop only, so following redirects would let a 3xx from the allowlisted
  // host land anywhere (second-pass review 2026-08-10, finding N2).
  // Cloudinary delivery URLs serve directly; a redirect here is always
  // unexpected and rejecting it keeps the SSRF allowlist airtight.
  let upstream: Response
  try {
    upstream = await fetch(sourceUrl, { redirect: 'error' })
  } catch {
    return NextResponse.json(
      { ok: false, error: 'source fetch failed (network error or redirect)' },
      { status: 502 },
    )
  }
  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `source fetch failed: ${upstream.status}` },
      { status: 502 },
    )
  }

  const mimeType = upstream.headers.get('content-type')?.split(';')[0] ?? ''
  // svg+xml passes an `image/*` prefix check but can carry scripts, and
  // this route exists for raster covers — reject it outright (N4).
  if (
    !mimeType.startsWith(ALLOWED_MIME_PREFIX) ||
    mimeType === 'image/svg+xml'
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `source is not a raster image (${mimeType || 'unknown'})`,
      },
      { status: 415 },
    )
  }

  // Reject oversized responses BEFORE buffering when the upstream declares
  // a length (N3); the post-read check below stays as the enforcement for
  // chunked/undeclared responses.
  const declaredLength = Number(upstream.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `source size out of bounds (${declaredLength} bytes declared)`,
      },
      { status: 413 },
    )
  }

  const buffer = Buffer.from(await upstream.arrayBuffer())
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: `source size out of bounds (${buffer.byteLength} bytes)`,
      },
      { status: 413 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  let media
  try {
    media = await payload.create({
      collection: 'media',
      data: { alt },
      file: {
        data: buffer,
        name: filenameFromUrl(sourceUrl),
        mimetype: mimeType,
        size: buffer.byteLength,
      },
    })
  } catch (error) {
    // e.g. a mime type that passes image/* here but isn't in the Media
    // collection's allowlist (image/tiff) — a caller problem, not a crash.
    payload.logger.error({ err: error }, 'media ingest: payload.create failed')
    return NextResponse.json(
      { ok: false, error: 'media creation rejected (unsupported type?)' },
      { status: 422 },
    )
  }

  return NextResponse.json({
    ok: true,
    media: {
      id: media.id,
      url: media.url,
      filename: media.filename,
    },
  })
}

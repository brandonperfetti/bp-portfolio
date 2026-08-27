import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { CMS_TAGS } from '@/lib/cms/cache'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

function parseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return []
  }

  return tags.filter(
    (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0,
  )
}

/**
 * Manual revalidation endpoint (secret-gated) for forcing CMS tags/paths
 * live outside the Payload hooks — e.g. an MCP-driven edit or a hook that
 * failed to fire.
 *
 * @remarks `revalidateTag(tag, { expire: 0 })`, not `'max'` (#118): under
 * cacheComponents (`'use cache'` readers, #76) `'max'` is
 * stale-while-revalidate with a one-year stale window, so a manual
 * revalidation call would keep serving old content until a background
 * refresh happened to land AND re-cache that stale render into the CDN in
 * the meantime. `{ expire: 0 }` is the documented read-your-writes profile
 * outside Server Actions: the first post-call regeneration blocks for fresh
 * data instead of serve-stale-then-refresh.
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

  const tags = parseTags(body.tags)
  const paths = parseTags(body.paths)

  const fallbackTags = [
    CMS_TAGS.articles,
    CMS_TAGS.projects,
    CMS_TAGS.tech,
    CMS_TAGS.uses,
    CMS_TAGS.workHistory,
    CMS_TAGS.pages,
    CMS_TAGS.settings,
    CMS_TAGS.navigation,
    CMS_TAGS.identity,
  ]

  const finalTags = tags.length ? tags : fallbackTags

  for (const tag of finalTags) {
    revalidateTag(tag, { expire: 0 })
  }

  for (const path of paths) {
    revalidatePath(path)
  }

  return NextResponse.json({
    ok: true,
    revalidated: {
      tags: finalTags,
      paths,
    },
  })
}

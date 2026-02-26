import { NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

import { CMS_TAGS } from '@/lib/cms/cache'

function parseTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) {
    return []
  }

  return tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
}

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret || body?.secret !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
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
  ]

  const finalTags = tags.length ? tags : fallbackTags

  for (const tag of finalTags) {
    revalidateTag(tag, 'max')
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

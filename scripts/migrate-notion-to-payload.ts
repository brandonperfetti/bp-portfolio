/**
 * One-time Notion → Payload article migration (§8a). NOT a cron, NOT wired
 * into the app: run manually with `pnpm payload run scripts/migrate-notion-to-payload.ts`.
 *
 * Reads every article (draft + published) from the v3 Notion Content DB,
 * converts the Source Article block tree to Lexical, downloads the cover
 * image (Cloudinary/Notion) into the Media collection (Vercel Blob when
 * configured), and upserts a Payload Post as a DRAFT with the slug preserved
 * exactly. Emits scripts/migration-report.json for reconciliation.
 *
 * Env (one-off, not part of the app):
 * - NOTION_API_TOKEN, NOTION_CMS_ARTICLES_DATA_SOURCE (collection://<id>)
 * - NOTION_API_VERSION (default 2025-09-03)
 * - DATABASE_URI, PAYLOAD_SECRET (+ BLOB_READ_WRITE_TOKEN for Blob covers)
 * - DRY_RUN=true to map + report without writing
 * - ONLY_SLUG=<slug> to migrate a single article
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { writeFileSync } from 'fs'
import path from 'path'

type NotionRichText = {
  plain_text?: string
  href?: string | null
  text?: { content?: string; link?: { url?: string } | null }
  annotations?: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
  }
}

type NotionBlock = {
  id: string
  type: string
  has_children?: boolean
  [key: string]: unknown
}

console.log(
  `[migrate] starting — dryRun=${process.env.DRY_RUN === 'true'} node=${process.version}`,
)
console.log(
  `[migrate] env present: NOTION_API_TOKEN=${Boolean(process.env.NOTION_API_TOKEN)} ` +
    `NOTION_CMS_ARTICLES_DATA_SOURCE=${Boolean(process.env.NOTION_CMS_ARTICLES_DATA_SOURCE)} ` +
    `DATABASE=${Boolean(process.env.DATABASE_URI || process.env.POSTGRES_URL || process.env.DATABASE_URL)} ` +
    `PAYLOAD_SECRET=${Boolean(process.env.PAYLOAD_SECRET)} ` +
    `BLOB_TOKEN=${Boolean(process.env.BLOB_READ_WRITE_TOKEN)}`,
)

process.on('unhandledRejection', (err) => {
  console.error('[migrate] unhandled rejection:', err)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[migrate] uncaught exception:', err)
  process.exit(1)
})

const NOTION_VERSION = process.env.NOTION_API_VERSION || '2025-09-03'
const NOTION_TOKEN = process.env.NOTION_API_TOKEN
const ARTICLES_SOURCE = (
  process.env.NOTION_CMS_ARTICLES_DATA_SOURCE || ''
).replace('collection://', '')
const DRY_RUN = process.env.DRY_RUN === 'true'
const ONLY_SLUG = process.env.ONLY_SLUG

if (!NOTION_TOKEN || !ARTICLES_SOURCE) {
  console.error(
    'NOTION_API_TOKEN and NOTION_CMS_ARTICLES_DATA_SOURCE are required.',
  )
  process.exit(1)
}

const notion = async (pathname: string, init?: RequestInit): Promise<any> => {
  const res = await fetch(`https://api.notion.com/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Notion ${pathname} → ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

/* ------------------------- property helpers (v3 mapper) ------------------------- */

const prop = (props: Record<string, any>, names: string[]): any => {
  for (const n of names) if (props[n]) return props[n]
  return undefined
}
const toText = (p: any): string => {
  if (!p) return ''
  const rt: NotionRichText[] = p.title || p.rich_text || []
  if (rt.length)
    return rt.map((r) => r.plain_text ?? r.text?.content ?? '').join('')
  if (typeof p.url === 'string') return p.url
  if (p.select?.name) return p.select.name
  if (typeof p.number === 'number') return String(p.number)
  return ''
}
const toDate = (p: any): string | undefined => p?.date?.start || undefined
const toMulti = (p: any): string[] =>
  (p?.multi_select || []).map((o: { name: string }) => o.name).filter(Boolean)
const toRelationIds = (p: any): string[] =>
  (p?.relation || []).map((r: { id: string }) => r.id).filter(Boolean)
const toFileUrl = (p: any): string => {
  const f = p?.files?.[0]
  return f?.external?.url || f?.file?.url || ''
}
const toSlug = (v: string): string =>
  v
    .trim()
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^\w-]+/g, '')

/* ------------------------- lexical builders ------------------------- */

const textNode = (rt: NotionRichText) => {
  let format = 0
  const a = rt.annotations || {}
  if (a.bold) format |= 1
  if (a.italic) format |= 2
  if (a.strikethrough) format |= 4
  if (a.underline) format |= 8
  if (a.code) format |= 16
  return {
    type: 'text',
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: rt.plain_text ?? rt.text?.content ?? '',
    version: 1,
  }
}

const inlineNodes = (rts: NotionRichText[] = []) =>
  rts.map((rt) => {
    const url = rt.href ?? rt.text?.link?.url
    if (url) {
      return {
        type: 'link',
        children: [textNode(rt)],
        direction: 'ltr',
        fields: { linkType: 'custom', newTab: true, url },
        format: '',
        indent: 0,
        version: 3,
      }
    }
    return textNode(rt)
  })

const paragraph = (rts: NotionRichText[] = []) => ({
  type: 'paragraph',
  children: inlineNodes(rts),
  direction: 'ltr',
  format: '',
  indent: 0,
  textFormat: 0,
  version: 1,
})

const heading = (
  tag: 'h1' | 'h2' | 'h3' | 'h4',
  rts: NotionRichText[] = [],
) => ({
  type: 'heading',
  children: inlineNodes(rts),
  direction: 'ltr',
  format: '',
  indent: 0,
  tag,
  version: 1,
})

const listItem = (rts: NotionRichText[], value: number, checked?: boolean) => ({
  type: 'listitem',
  children: inlineNodes(rts),
  direction: 'ltr',
  format: '',
  indent: 0,
  value,
  version: 1,
  ...(checked === undefined ? {} : { checked }),
})

const list = (
  listType: 'bullet' | 'number' | 'check',
  items: ReturnType<typeof listItem>[],
) => ({
  type: 'list',
  children: items,
  direction: 'ltr',
  format: '',
  indent: 0,
  listType,
  start: 1,
  tag: listType === 'number' ? 'ol' : 'ul',
  version: 1,
})

const quote = (rts: NotionRichText[] = []) => ({
  type: 'quote',
  children: inlineNodes(rts),
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
})

let blockNodeId = 0
const lexicalBlock = (blockType: string, fields: Record<string, unknown>) => ({
  type: 'block',
  fields: {
    id: `migrated-${++blockNodeId}`,
    blockName: '',
    blockType,
    ...fields,
  },
  format: '',
  version: 2,
})

const bannerContent = (rts: NotionRichText[] = []) => ({
  root: {
    type: 'root',
    children: [paragraph(rts)],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

/* ------------------------- notion block tree → lexical ------------------------- */

const listChildren = async (blockId: string): Promise<NotionBlock[]> => {
  const out: NotionBlock[] = []
  let cursor: string | undefined
  do {
    const page = await notion(
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
    )
    out.push(...(page.results as NotionBlock[]))
    cursor = page.has_more ? page.next_cursor : undefined
  } while (cursor)
  return out
}

type MediaUploader = (url: string, alt: string) => Promise<number | null>

const convertBlocks = async (
  blocks: NotionBlock[],
  uploadMedia: MediaUploader,
  warnings: string[],
): Promise<any[]> => {
  const children: any[] = []
  let pendingList: {
    type: 'bullet' | 'number' | 'check'
    items: any[]
  } | null = null
  let listValue = 0

  const flushList = () => {
    if (pendingList) {
      children.push(list(pendingList.type, pendingList.items))
      pendingList = null
      listValue = 0
    }
  }

  const pushListItem = (
    type: 'bullet' | 'number' | 'check',
    rts: NotionRichText[],
    checked?: boolean,
  ) => {
    if (!pendingList || pendingList.type !== type) {
      flushList()
      pendingList = { type, items: [] }
      listValue = 0
    }
    pendingList.items.push(listItem(rts, ++listValue, checked))
  }

  for (const block of blocks) {
    const b = block as any
    switch (block.type) {
      case 'paragraph':
        flushList()
        children.push(paragraph(b.paragraph?.rich_text))
        break
      case 'heading_1':
        flushList()
        children.push(heading('h2', b.heading_1?.rich_text))
        break
      case 'heading_2':
        flushList()
        children.push(heading('h2', b.heading_2?.rich_text))
        break
      case 'heading_3':
        flushList()
        children.push(heading('h3', b.heading_3?.rich_text))
        break
      case 'bulleted_list_item':
        pushListItem('bullet', b.bulleted_list_item?.rich_text)
        break
      case 'numbered_list_item':
        pushListItem('number', b.numbered_list_item?.rich_text)
        break
      case 'to_do':
        pushListItem('check', b.to_do?.rich_text, Boolean(b.to_do?.checked))
        break
      case 'quote':
        flushList()
        children.push(quote(b.quote?.rich_text))
        break
      case 'callout':
        flushList()
        children.push(
          lexicalBlock('banner', {
            style: 'info',
            content: bannerContent(b.callout?.rich_text),
          }),
        )
        break
      case 'code':
        flushList()
        children.push(
          lexicalBlock('code', {
            language: mapCodeLanguage(b.code?.language),
            code: (b.code?.rich_text || [])
              .map((r: NotionRichText) => r.plain_text ?? '')
              .join(''),
          }),
        )
        break
      case 'image': {
        flushList()
        const url = b.image?.external?.url || b.image?.file?.url
        const alt =
          (b.image?.caption || [])
            .map((r: NotionRichText) => r.plain_text)
            .join('') || 'Article image'
        if (url) {
          const mediaId = await uploadMedia(url, alt)
          if (mediaId) {
            children.push({
              type: 'upload',
              fields: null,
              format: '',
              relationTo: 'media',
              value: mediaId,
              version: 3,
            })
          } else {
            warnings.push(`image upload failed: ${url.slice(0, 120)}`)
          }
        }
        break
      }
      case 'divider':
        flushList()
        children.push({ type: 'horizontalrule', version: 1 })
        break
      default:
        if (b[block.type]?.rich_text?.length) {
          flushList()
          children.push(paragraph(b[block.type].rich_text))
          warnings.push(
            `unhandled block type rendered as paragraph: ${block.type}`,
          )
        } else {
          warnings.push(`skipped block type: ${block.type}`)
        }
    }

    if (
      block.has_children &&
      !['to_do', 'bulleted_list_item', 'numbered_list_item'].includes(
        block.type,
      )
    ) {
      const nested = await convertBlocks(
        await listChildren(block.id),
        uploadMedia,
        warnings,
      )
      children.push(...nested)
    }
  }
  flushList()
  return children
}

/** Map Notion code languages to the Code block's select options. */
const mapCodeLanguage = (lang?: string): string => {
  const map: Record<string, string> = {
    typescript: 'typescript',
    javascript: 'javascript',
    css: 'css',
    'plain text': 'none',
  }
  return map[(lang || '').toLowerCase()] || 'typescript'
}

/* ------------------------- main ------------------------- */

const run = async () => {
  console.log('[migrate] initializing Payload…')
  // Keep the event loop alive so a hung init HANGS VISIBLY instead of letting
  // node exit silently; watchdog names the likely culprit.
  const keepalive = setInterval(() => {}, 30_000)
  const watchdog = setTimeout(() => {
    console.error(
      '[migrate] still initializing after 20s — Payload init is stuck. ' +
        'Most likely the DATABASE_URL connection is hanging (check the Neon ' +
        'pooled URL, network, or sslmode). Ctrl+C to abort.',
    )
  }, 20_000)
  const payload: Payload = await getPayload({ config })
  clearTimeout(watchdog)
  clearInterval(keepalive)
  console.log('[migrate] Payload ready; querying Notion…')
  const report: Array<{
    slug: string
    title: string
    action: 'created' | 'updated' | 'skipped' | 'failed' | 'dry-run'
    notionStatus?: string
    warnings?: string[]
    error?: string
  }> = []

  // Query every article in the Content DB (drafts included — no status filter).
  const pages: any[] = []
  let cursor: string | undefined
  do {
    const res = await notion(`/data_sources/${ARTICLES_SOURCE}/query`, {
      method: 'POST',
      body: JSON.stringify({
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    pages.push(...res.results)
    cursor = res.has_more ? res.next_cursor : undefined
  } while (cursor)

  payload.logger.info(`Notion articles found: ${pages.length}`)

  const mediaCache = new Map<string, number | null>()
  const uploadMedia: MediaUploader = async (url, alt) => {
    if (mediaCache.has(url)) return mediaCache.get(url)!
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mimetype = res.headers.get('content-type') || 'image/jpeg'
      const ext = mimetype.includes('png')
        ? 'png'
        : mimetype.includes('webp')
          ? 'webp'
          : mimetype.includes('gif')
            ? 'gif'
            : 'jpg'
      const name = `migrated-${path.basename(new URL(url).pathname, path.extname(new URL(url).pathname)).slice(0, 60)}.${ext}`
      if (DRY_RUN) {
        mediaCache.set(url, null)
        return null
      }
      const doc = await payload.create({
        collection: 'media',
        data: { alt },
        file: { data: buffer, mimetype, name, size: buffer.length },
      })
      mediaCache.set(url, doc.id as number)
      return doc.id as number
    } catch (err) {
      payload.logger.warn(
        `media upload failed for ${url.slice(0, 120)}: ${String(err)}`,
      )
      mediaCache.set(url, null)
      return null
    }
  }

  const findOrCreateTerm = async (
    collection: 'categories' | 'tags',
    title: string,
  ): Promise<number | null> => {
    const slug = toSlug(title)
    const existing = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
    })
    if (existing.docs[0]) return existing.docs[0].id as number
    if (DRY_RUN) return null
    const doc = await payload.create({
      collection,
      data: { title, slug, slugLock: true },
    })
    return doc.id as number
  }

  for (const page of pages) {
    const props = page.properties || {}
    const title = toText(prop(props, ['Title', 'Name']))
    const slug = toSlug(toText(prop(props, ['Slug'])) || title)
    const notionStatus = toText(prop(props, ['Status']))
    const warnings: string[] = []

    if (!title || !slug) {
      report.push({
        slug: slug || '(none)',
        title: title || '(none)',
        action: 'skipped',
        notionStatus,
        warnings: ['missing title or slug'],
      })
      continue
    }
    if (ONLY_SLUG && slug !== ONLY_SLUG) continue

    try {
      const description = toText(
        prop(props, ['Meta Description', 'Description']),
      )
      const seoTitle = toText(prop(props, ['SEO Title']))
      const seoDescription =
        toText(prop(props, ['SEO Description', 'SEO Meta Description'])) ||
        description
      const publishedAt = toDate(
        prop(props, ['Publish Date', 'Published Date']),
      )
      const topics = toMulti(prop(props, ['Topics/Tags', 'Topics', 'Tags']))
      const techTags = toMulti(
        prop(props, ['Tech', 'Tech Stack', 'Technologies']),
      )
      const coverUrl =
        toText(
          prop(props, [
            'Cover Image URL',
            'Hero Image URL',
            'Image URL',
            'OG Image URL',
          ]),
        ) ||
        toFileUrl(
          prop(props, ['Cover Image', 'Hero Image', 'Image', 'OG Image']),
        ) ||
        (page.cover?.external?.url ?? page.cover?.file?.url ?? '')
      const sourceIds = toRelationIds(prop(props, ['Source Article']))

      if (!sourceIds.length) {
        report.push({
          slug,
          title,
          action: 'skipped',
          notionStatus,
          warnings: ['no Source Article relation'],
        })
        continue
      }

      // Body: Source Article page blocks are canonical (v3 rule).
      const bodyBlocks = await listChildren(sourceIds[0])
      const lexicalChildren = await convertBlocks(
        bodyBlocks,
        uploadMedia,
        warnings,
      )
      const content = {
        root: {
          type: 'root',
          children: lexicalChildren.length ? lexicalChildren : [paragraph([])],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          version: 1,
        },
      }

      const heroImageId = coverUrl
        ? await uploadMedia(coverUrl, `${title} cover`)
        : null
      if (coverUrl && !heroImageId && !DRY_RUN)
        warnings.push('cover image failed to upload')

      const categoryIds = (
        await Promise.all(topics.map((t) => findOrCreateTerm('categories', t)))
      ).filter((id): id is number => id !== null)
      const tagIds = (
        await Promise.all(techTags.map((t) => findOrCreateTerm('tags', t)))
      ).filter((id): id is number => id !== null)

      const data = {
        title,
        slug,
        slugLock: true,
        excerpt: description || undefined,
        content,
        publishedAt: publishedAt || undefined,
        heroImage: heroImageId || undefined,
        categories: categoryIds,
        tags: tagIds,
        meta: {
          title: seoTitle || title,
          description: seoDescription || undefined,
          image: heroImageId || undefined,
        },
        _status: 'draft' as const,
      }

      if (DRY_RUN) {
        report.push({ slug, title, action: 'dry-run', notionStatus, warnings })
        continue
      }

      const existing = await payload.find({
        collection: 'posts',
        where: { slug: { equals: slug } },
        draft: true,
        limit: 1,
      })

      if (existing.docs[0]) {
        await payload.update({
          collection: 'posts',
          id: existing.docs[0].id,
          data,
          draft: true,
        })
        report.push({ slug, title, action: 'updated', notionStatus, warnings })
      } else {
        await payload.create({ collection: 'posts', data, draft: true })
        report.push({ slug, title, action: 'created', notionStatus, warnings })
      }
      payload.logger.info(`migrated: ${slug}`)
    } catch (err) {
      report.push({
        slug,
        title,
        action: 'failed',
        notionStatus,
        error: String(err),
      })
      payload.logger.error(`failed: ${slug} — ${String(err)}`)
    }
  }

  const summary = report.reduce<Record<string, number>>((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1
    return acc
  }, {})
  const reportPath = path.resolve(
    process.cwd(),
    'scripts/migration-report.json',
  )
  writeFileSync(reportPath, JSON.stringify({ summary, report }, null, 2))
  payload.logger.info(`Report written to ${reportPath}`)
  payload.logger.info(`Summary: ${JSON.stringify(summary)}`)
  process.exit(0)
}

// Top-level await: `payload run` waits for module evaluation, then exits the
// process — a floating promise here gets killed mid-init.
try {
  await run()
} catch (err) {
  console.error('[migrate] fatal:', err)
  process.exit(1)
}

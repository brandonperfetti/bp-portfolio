// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createFixturePage,
  createFixturePost,
} from './fixtures/payload-fixtures'

/**
 * Internal links in a gated body, read the trusted way, against REAL Payload
 * on REAL Postgres (#359).
 *
 * @remarks **Why this tier.** `getGatedPostContent` reads with
 * `overrideAccess: true`, and Payload forwards that override into the Lexical
 * link population, so a link to a draft target comes back populated instead
 * of as the bare id an access-enforced read returns. Whether that populated
 * value carries `_status` is decided by Payload's populate/select plumbing and
 * the collections' `defaultPopulate`, which leaves `_status` out. A mocked
 * `findByID` can only restate an assumption about that shape; this file
 * measures it. `lexicalToBlocks` takes a populated target without `_status` as
 * published (the shape every access-enforced read returns), so the read has to
 * ask for it.
 *
 * The control case reads the same post with no `populate` to show the hazard
 * is real: the draft target comes back with a path and no `_status`.
 *
 * **Why `next/cache` and `next/headers` are stubbed.** The revalidation hooks
 * call `revalidatePath`, which throws outside a Next request scope; `posts.ts`
 * imports `draftMode` at module scope.
 *
 * Runs in the `e2e` job (real `pnpm migrate`). Every row is marked and removed
 * in `afterAll`.
 */

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
}))

const connectionString = process.env.DATABASE_URI

/** Marks every document this file writes, for exact cleanup. */
const MARKER = 'zz-gated-content-links-integration'

const layout = [{ blockType: 'spacer', size: 'md' }]

const text = (value: string) => ({
  type: 'text',
  text: value,
  format: 0,
  style: '',
  mode: 'normal',
  detail: 0,
  version: 1,
})

/** An internal Lexical link to a page, the shape LinkFeature stores. */
const pageLink = (label: string, pageId: number | string) => ({
  type: 'link',
  version: 3,
  format: '' as const,
  indent: 0,
  direction: 'ltr' as const,
  fields: {
    linkType: 'internal',
    newTab: false,
    doc: { relationTo: 'pages', value: pageId },
  },
  children: [text(label)],
})

const bodyLinking = (draftId: number | string, liveId: number | string) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '' as const,
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [
          pageLink('draft target', draftId),
          text(' and '),
          pageLink('live target', liveId),
        ],
      },
    ],
  },
})

type LinkNode = {
  type?: string
  fields?: { doc?: { value?: unknown } }
  children?: LinkNode[]
}

/** The populated `doc.value` of each link in a body, in document order. */
const linkTargets = (content: unknown): unknown[] => {
  const out: unknown[] = []
  const walk = (nodes: LinkNode[] = []) => {
    for (const node of nodes) {
      if (node.type === 'link') out.push(node.fields?.doc?.value)
      walk(node.children)
    }
  }
  walk((content as { root?: { children?: LinkNode[] } }).root?.children)
  return out
}

describe('gated content links integration requires a database', () => {
  it('has DATABASE_URI set, or this whole tier silently skips', () => {
    expect(
      connectionString,
      'the e2e job must set DATABASE_URI, or this tier silently skips',
    ).toBeTruthy()
  })
})

describe.skipIf(!connectionString)(
  'getGatedPostContent link targets (real Payload, real Postgres)',
  () => {
    let payload: Awaited<ReturnType<typeof import('payload').getPayload>>
    let getGatedPostContent: typeof import('../src/lib/content/posts').getGatedPostContent
    let lexicalToBlocks: typeof import('../src/lib/content/lexicalToBlocks').lexicalToBlocks
    let postId: number

    const cleanup = async () => {
      if (!payload) return
      await payload.delete({
        collection: 'posts',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
      await payload.delete({
        collection: 'pages',
        where: { slug: { like: `%${MARKER}%` } },
        overrideAccess: true,
      })
    }

    beforeAll(async () => {
      const { getPayload } = await import('payload')
      const { default: config } = await import('../src/payload.config')
      payload = await getPayload({ config })
      ;({ getGatedPostContent } = await import('../src/lib/content/posts'))
      ;({ lexicalToBlocks } =
        await import('../src/lib/content/lexicalToBlocks'))
      await cleanup()

      const draft = await createFixturePage(payload, {
        data: {
          title: 'Draft target',
          layout,
          _status: 'draft',
          slug: `${MARKER}-draft`,
        },
      })
      const live = await createFixturePage(payload, {
        data: {
          title: 'Live target',
          layout,
          _status: 'published',
          slug: `${MARKER}-live`,
        },
      })
      const post = await createFixturePost(payload, {
        data: {
          title: 'Gated links',
          slug: `${MARKER}-post`,
          _status: 'published',
          content: bodyLinking(draft.id, live.id),
        },
      })
      postId = post.id as number
    }, 120_000)

    afterAll(cleanup)

    it('control: without its own populate the trusted read drops _status', async () => {
      const doc = await payload.findByID({
        collection: 'posts',
        id: postId,
        depth: 2,
        overrideAccess: true,
        select: { content: true },
      })
      const [draft] = linkTargets(doc.content)
      expect(draft).toMatchObject({ path: `${MARKER}-draft` })
      expect(draft).not.toHaveProperty('_status')
    })

    it('populates each link target with its _status', async () => {
      const [draft, live] = linkTargets(await getGatedPostContent(postId))
      expect(draft).toMatchObject({
        _status: 'draft',
        path: `${MARKER}-draft`,
      })
      expect(live).toMatchObject({
        _status: 'published',
        path: `${MARKER}-live`,
      })
    })

    it('renders the draft target as text and links the published one', async () => {
      const blocks = lexicalToBlocks(await getGatedPostContent(postId))
      const runs = JSON.stringify(blocks)
      expect(runs).toContain('draft target')
      expect(runs).toContain(`"href":"/${MARKER}-live"`)
      expect(runs).not.toContain(`/${MARKER}-draft`)
    })
  },
)

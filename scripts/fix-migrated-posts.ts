/**
 * Post-migration touch-up (run after the article migration):
 * 1. Audits every post's `content` (reports how many body nodes are stored,
 *    so an admin-side render problem can't be mistaken for data loss).
 * 2. Backfills `authors` with the first admin user wherever it's empty.
 *
 * Usage: `pnpm payload run scripts/fix-migrated-posts.ts`
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const payload = await getPayload({ config })

const users = await payload.find({
  collection: 'users',
  limit: 1,
  sort: 'createdAt',
})
const admin = users.docs[0]
if (!admin) {
  console.error('[fix] no users exist — create the admin account first.')
  process.exit(1)
}

const { docs: posts } = await payload.find({
  collection: 'posts',
  draft: true,
  limit: 500,
  pagination: false,
})

let backfilled = 0
for (const post of posts) {
  const nodeCount = post.content?.root?.children?.length ?? 0
  const hasAuthors = Array.isArray(post.authors) && post.authors.length > 0
  console.log(
    `[audit] ${String(post.slug).slice(0, 60).padEnd(60)} nodes=${String(nodeCount).padStart(3)} authors=${hasAuthors ? 'yes' : 'NO'}`,
  )
  if (!hasAuthors) {
    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { authors: [admin.id] },
      draft: true,
      context: { disableRevalidate: true },
    })
    backfilled++
  }
}

console.log(
  `[fix] authors backfilled on ${backfilled}/${posts.length} posts (→ ${admin.email})`,
)
process.exit(0)

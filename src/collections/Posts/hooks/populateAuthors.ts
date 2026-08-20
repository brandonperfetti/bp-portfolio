import type { CollectionAfterReadHook } from 'payload'
import { Author } from '@/payload-types'

// Authors are a PUBLIC collection (unlike the access-locked `users`), so a
// depth-populated `authors` relation is already returned to anonymous reads.
// This hook keeps the admin-hidden `populatedAuthors` mirror ({id,name}) in
// sync as a lightweight byline fallback; the rich byline shape (role, avatar,
// socials) is resolved from the populated `authors` relation in articlesRepo.
export const populateAuthors: CollectionAfterReadHook = async ({
  doc,
  req: { payload },
}) => {
  if (doc?.authors && doc?.authors?.length > 0) {
    const authorDocs: Author[] = []

    for (const author of doc.authors) {
      try {
        const authorDoc = await payload.findByID({
          id: typeof author === 'object' ? author?.id : author,
          collection: 'authors',
          depth: 0,
        })

        if (authorDoc) {
          authorDocs.push(authorDoc)
        }

        if (authorDocs.length > 0) {
          doc.populatedAuthors = authorDocs.map((authorDoc) => ({
            id: authorDoc.id,
            name: authorDoc.name,
          }))
        }
      } catch {
        // swallow error
      }
    }
  }

  return doc
}

import { getPayload } from 'payload'
import configPromise from '@payload-config'
import * as z from 'zod'

import { canAccess } from '@/access/canAccess'
import { publicPathFor } from '@/fields/slug/slugPaths'

/**
 * The page a chat turn was sent from, as the client names it (#217 phase 2).
 *
 * @remarks **A reference, never content.** The client may say WHICH document
 * it is on — a collection and a numeric id, the same pair `RenderBlocks`
 * already threads to its blocks as `hostDoc` — and nothing else. There is no
 * title, no path and no free text, so there is nothing a crafted body can put
 * into the prompt: everything the model is told about the page is read back
 * from the CMS by {@link resolveHostDocument}. `.strict()` refuses a reference
 * that carries any extra key rather than silently dropping it, so an attempt
 * to smuggle a `title` fails the request visibly instead of looking accepted.
 */
export const pageContextSchema = z
  .object({
    collection: z.enum(['pages', 'posts']),
    id: z.number().int().positive(),
  })
  .strict()

/** A validated host-document reference. */
export type CorvusPageContext = z.infer<typeof pageContextSchema>

/** What the prompt is told about the host page: server-resolved values only. */
export interface ResolvedHostDocument {
  /** The document's title, normalised by {@link cleanHostTitle}. */
  title: string
  /** The path the document is served at (`/work/brytecore`, `/` for root). */
  path: string
}

/**
 * Longest title the context line carries.
 *
 * @remarks Every real title is far shorter; the cap only bounds what an
 * oversized CMS value could add to every turn's prompt.
 */
export const HOST_TITLE_MAX_CHARS = 160

/**
 * How long the host lookup may hold a turn before it proceeds ungrounded.
 *
 * @remarks The lookup is one indexed `find` by id, so this is a ceiling for a
 * slow database, not an expected latency. It sits on time-to-first-token
 * beside retrieval's embed call, and a page name is never worth more of that
 * than a second.
 */
export const HOST_LOOKUP_TIMEOUT_MS = 1_000

/**
 * A CMS title as one plain line.
 *
 * @remarks The title is editor-authored site content, but it lands inside the
 * system prompt, so it is reduced to a single line of printable text: control
 * characters and line breaks become spaces, runs of whitespace collapse, and
 * the result is capped at {@link HOST_TITLE_MAX_CHARS}. A title cannot then
 * open a new paragraph of instructions or close the quotes around it.
 *
 * @param value - The stored title.
 * @returns The cleaned title, or `null` when nothing printable is left.
 */
export function cleanHostTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const flat = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!flat) return null
  return flat.length > HOST_TITLE_MAX_CHARS
    ? `${flat.slice(0, HOST_TITLE_MAX_CHARS - 1).trimEnd()}…`
    : flat
}

/** The fields {@link resolveHostDocument} reads from the stored document. */
export interface HostDocumentRow {
  title?: unknown
  slug?: unknown
  path?: unknown
  access?: { visibility?: unknown } | null
}

/**
 * Reads one PUBLISHED document by id, or `null`.
 *
 * @remarks Injected so the resolver's rules can be tested without Payload.
 */
export type HostDocumentFinder = (
  ref: CorvusPageContext,
) => Promise<HostDocumentRow | null>

/**
 * The default finder: the published view, through the collection's own
 * access control.
 *
 * @remarks `draft: false` plus `_status = published` is the same pair the
 * embedding backfill uses for posts, and `overrideAccess: false` runs the
 * collection's read access with no user, so a document the public cannot
 * read never comes back at all. Depth 0 and a four-field `select` keep it to
 * one narrow row.
 *
 * @param ref - The validated reference.
 * @returns The stored row, or `null` when no published document has that id.
 */
const findPublishedHostDocument: HostDocumentFinder = async (ref) => {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: ref.collection,
    depth: 0,
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    select:
      ref.collection === 'posts'
        ? { title: true, slug: true, path: true, access: true }
        : { title: true, slug: true, path: true },
    where: {
      and: [{ id: { equals: ref.id } }, { _status: { equals: 'published' } }],
    },
  })
  return (docs[0] as HostDocumentRow | undefined) ?? null
}

/**
 * Resolve a host-document reference to the title and path the prompt names.
 *
 * @remarks **Never rejects, and every failure is "no context".** An id that
 * resolves to nothing, a draft, a post the viewer may not read, a document
 * with no title or no public path, a database error and a lookup slower than
 * {@link HOST_LOOKUP_TIMEOUT_MS} all return `null`, and the turn then runs
 * exactly as a `/corvus` turn does. A page name is a convenience; it must
 * never be the reason a chat turn fails.
 *
 * A gated post is checked with `canAccess`, the site's one gating decision,
 * rather than trusted because its row came back: the collection's read
 * access returns a gated post's row to anyone, and only its body is gated.
 * Naming a gated article to a visitor who cannot read it would be a small
 * leak, so it is not named.
 *
 * @param ref - The validated reference, or `undefined` when the turn has none.
 * @param options - `isAuthenticated` for the gating check; `find` and
 * `timeoutMs` for tests.
 * @returns The resolved title and path, or `null`.
 */
export async function resolveHostDocument(
  ref: CorvusPageContext | undefined,
  {
    isAuthenticated,
    find = findPublishedHostDocument,
    timeoutMs = HOST_LOOKUP_TIMEOUT_MS,
  }: {
    isAuthenticated: boolean
    find?: HostDocumentFinder
    timeoutMs?: number
  },
): Promise<ResolvedHostDocument | null> {
  if (!ref) return null
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs)
    })
    const row = await Promise.race([find(ref), timeout])
    if (!row) return null
    if (ref.collection === 'posts') {
      // Anything but a missing or `public` value counts as gated, the reading
      // `canAccess` itself gives a value it does not recognise.
      const stored = row.access?.visibility
      const visibility =
        stored === undefined || stored === null || stored === 'public'
          ? 'public'
          : 'gated'
      if (!canAccess(isAuthenticated, { access: { visibility } })) return null
    }
    const title = cleanHostTitle(row.title)
    const path = publicPathFor(ref.collection, {
      slug: typeof row.slug === 'string' ? row.slug : null,
      path: typeof row.path === 'string' ? row.path : null,
    })
    if (!title || !path) return null
    return { title, path }
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}

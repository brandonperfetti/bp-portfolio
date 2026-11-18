import { cacheLife, cacheTag } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { CmsFooterLink } from '@/lib/cms/types'

/**
 * What a footer link may point at: a path on this site, an `http(s)` URL or a
 * `mailto:` address.
 *
 * @remarks `href` is free text an editor types, and it becomes the `href` of
 * an anchor on every page, so what is not plainly one of those three is
 * dropped, not repaired:
 *
 * - A site path starts with exactly one slash. `//host` is a
 *   protocol-relative URL to another host, and so is `/\host`: browsers read
 *   a backslash as a slash in an `http(s)` URL.
 * - No backslash or control character anywhere, for the same reason (a tab or
 *   newline is stripped by the URL parser, which can turn a harmless-looking
 *   value into one of the forms above).
 * - No `/`-separated piece that starts with `[` and ends with `]`, in any
 *   kind of link. That is the exact test Next's app-router `<Link>` applies
 *   to the whole `href` (query string and off-site URLs included) before it
 *   throws "Dynamic href … is not supported" in development, which would take
 *   down every page that renders the footer. Percent-encode them (`%5B`,
 *   `%5D`). Brackets elsewhere in a piece (`?b=[c]`) are fine.
 * - A `mailto:` link names a recipient; the bare scheme does not.
 * - An `http(s)` URL must parse and name a host; `https://` alone does not.
 * - Any other scheme (`javascript:`, `data:`) and any bare word, which would
 *   resolve relative to whichever page is open.
 */
const isRenderableHref = (href: string): boolean => {
  if (/[\\\u0000-\u001f\u007f]/.test(href)) return false
  if (
    href
      .split('/')
      .some((piece) => piece.startsWith('[') && piece.endsWith(']'))
  ) {
    return false
  }
  if (/^\/(?!\/)/.test(href)) return true
  if (/^mailto:/i.test(href)) return /^mailto:[^?#]+/i.test(href)
  if (/^https?:\/\//i.test(href)) {
    try {
      return new URL(href).hostname !== ''
    } catch {
      return false
    }
  }
  return false
}

/**
 * The footer-only links from the Payload `footer` global's `links` array
 * (#363), in their saved order. Empty when the array is empty or the global
 * was never saved, and the footer then renders exactly what it did before.
 *
 * @remarks
 * These are links that belong in the footer and not in the header, a privacy
 * page first of all. They are rendered after the header navigation items the
 * footer has always shown, never instead of them, so adding one link cannot
 * make the others disappear.
 *
 * Same shape as {@link getCmsNavigation}: `'use cache: remote'` so the
 * `global_footer` purge from the global's `afterChange` hook reaches every
 * serverless instance, not only the one that ran the hook (#118), and
 * `overrideAccess: false` because the Local API default of `true` would skip
 * the global's `read` rule. That rule is `anyone` today; stated so a later,
 * narrower rule is honoured, not bypassed (#262).
 *
 * `depth: 0` and no second tag: a link is two strings, with no relation to a
 * page or a post, so nothing it shows depends on another document's publish
 * state (the case that made the consent reader subscribe to `pages` too). The
 * cost of that simplicity is that a link to an unpublished page is a link to
 * a 404 until the page is published; the editor types the path either way.
 */
export const getCmsFooterLinks = async (): Promise<CmsFooterLink[]> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.footer)
  cacheLife('cmsContent')
  const payload = await getPayload({ config: configPromise })
  const footer = await payload.findGlobal({
    slug: 'footer',
    depth: 0,
    overrideAccess: false,
  })
  const links: CmsFooterLink[] = []
  for (const link of footer?.links ?? []) {
    const label = link?.label?.trim()
    const href = link?.href?.trim()
    if (label && href && isRenderableHref(href)) links.push({ label, href })
  }
  return links
}

/**
 * {@link getCmsFooterLinks}, for the site layout: a failed read is logged and
 * renders as no footer links.
 *
 * @remarks `Layout` awaits this on every page. The links are an addition to
 * the footer, so a read that fails must cost the footer its extra links and
 * nothing else; left to reject, it would throw out of the layout and replace
 * the whole page with the global error screen.
 *
 * The fallback lives here and not inside the cached reader on purpose: a
 * `catch` inside `'use cache: remote'` would make the empty list the reader's
 * cached value for the `cmsContent` lifetime after one transient error. Here
 * the reader caches nothing on a failure, so the next render that runs it
 * asks again. That is a narrower promise than "the links come back on the
 * next request": a page prerendered while the read was failing keeps its
 * link-less footer until that page is regenerated.
 *
 * `unstable_rethrow` comes first because not everything thrown through a
 * cached read is a failure. Next signals a dynamic bail-out and the end of a
 * prerender by throwing, and swallowing one of those would turn a control
 * signal into "no footer links".
 */
export const getCmsFooterLinksOrNone = async (): Promise<CmsFooterLink[]> => {
  try {
    return await getCmsFooterLinks()
  } catch (error) {
    unstable_rethrow(error)
    console.error('[footer] footer links read failed; rendering none', {
      message: error instanceof Error ? error.message.slice(0, 300) : 'unknown',
    })
    return []
  }
}

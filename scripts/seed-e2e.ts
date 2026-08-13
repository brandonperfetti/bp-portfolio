import { createHash } from 'node:crypto'
import path from 'node:path'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import {
  PERSON_IMAGE_URL,
  SITE_OWNER_JOB_TITLE,
  SITE_OWNER_NAME,
  SITE_OWNER_SOCIAL_LINKS,
} from '../src/lib/identity'

/**
 * Deterministic, idempotent seed for the CI e2e job.
 *
 * @remarks CI's e2e job runs `pnpm migrate` against an empty Postgres with no
 * seed, so `/` — which `notFound()`s without a published `home` Pages doc (see
 * `src/app/(frontend)/page.tsx`) — 404s and every route that renders the site
 * chrome fails with it. This script seeds the minimum for the e2e suite to
 * exercise the real UI: the home images, the Identity + SiteSettings globals, a
 * few published Posts (so `/articles` shows its search UI), and the published
 * `home` and `about` docs carrying their *real* composed layouts, so `/` and
 * the flipped `/about` (#44) render the true pages and their sticky rails —
 * both `notFound()` without a published doc.
 *
 * Notion-free by design — CI has no Notion creds. Constants come from
 * `src/lib/identity.ts`; media are pulled from public Cloudinary URLs (CI has
 * internet). Idempotent: media reuse by a URL-unique filename key, globals via
 * `updateGlobal`, posts/home/about upserted by slug — so a re-run creates nothing new.
 *
 * Usage:
 *   pnpm seed:e2e            # → payload run scripts/seed-e2e.ts
 */

/** Cloudinary source for the hero-slot media (person avatar). */
const HERO_IMAGE_URL = PERSON_IMAGE_URL

/** Cloudinary sources for the home parallax photo strip (about five fill it). */
const PHOTO_STRIP_URLS = [
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-2_vutl5o.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298667/image-3_rfkaku.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298665/image-4_iten8l.jpg',
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298668/image-5_cpx20p.jpg',
]

/** Home headline/subtitle — the route's own fallback copy, kept in one place. */
const HOME_TITLE =
  'Senior frontend and full-stack engineer focused on practical software delivery.'
const HOME_SUBTITLE =
  "I'm Brandon Perfetti from Orange County, CA. I build reliable web platforms with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows, with product-minded delivery leadership."

/** About headline/subtitle/body — the flipped `/about` route's fallback copy. */
const ABOUT_TITLE =
  'I build software with a product mindset and an execution-first approach.'
const ABOUT_SUBTITLE =
  "I'm Brandon Perfetti, a product and project manager plus software engineer based in Orange County, California. Over the last decade, I've worked across startup and client teams where clear priorities, fast iteration, and reliable delivery are non-negotiable."
const ABOUT_BODY =
  'I lead and contribute across diverse teams, shifting between strategic planning and hands-on implementation as the work demands. That adaptability keeps teams aligned in fast-moving, ambiguous environments and turns complex product goals into reliable, user-focused software.'

/** A few published articles so `/articles` renders its search UI, not the empty state. */
const POSTS = [
  {
    slug: 'shipping-reliable-software',
    title: 'Shipping reliable software with small, focused changes',
    excerpt:
      'How I keep delivery predictable: tight feedback loops, tests that accompany behavior, and changes small enough to reason about.',
  },
  {
    slug: 'react-server-components-in-practice',
    title: 'React Server Components in practice',
    excerpt:
      'Notes from building a content platform on the App Router — where server components pay off and where they get in the way.',
  },
  {
    slug: 'product-minded-engineering',
    title: 'Product-minded engineering',
    excerpt:
      'Engineering execution and product judgment are the same muscle. A few habits that keep the two in sync.',
  },
]

/** A minimal Lexical rich-text value (one paragraph) for a seeded post body. */
const lexicalParagraph = (text: string) => ({
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
        textFormat: 0,
        children: [
          {
            type: 'text',
            text,
            format: 0,
            style: '',
            mode: 'normal' as const,
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
})

const run = async () => {
  const payload = await getPayload({ config })
  const report = {
    mediaCreated: 0,
    postsUpserted: 0,
    home: 'skipped',
    about: 'skipped',
  }

  /**
   * Upload a Cloudinary image into Media once, reusing an existing doc on
   * re-run (matched by a URL-unique filename key: basename + short URL hash).
   */
  const uploadMedia = async (url: string, alt: string): Promise<number> => {
    const parsed = new URL(url)
    const stem = path
      .basename(parsed.pathname, path.extname(parsed.pathname))
      .slice(0, 48)
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 8)
    const base = `e2e-${stem}-${hash}`
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 80)

    const existing = await payload.find({
      collection: 'media',
      limit: 1,
      where: { filename: { contains: base } },
    })
    if (existing.docs[0]) {
      return existing.docs[0].id as number
    }

    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`fetch ${res.status} for ${url}`)
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimetype = res.headers.get('content-type') || 'image/jpeg'
    const ext = mimetype.includes('png')
      ? 'png'
      : mimetype.includes('webp')
        ? 'webp'
        : mimetype.includes('svg')
          ? 'svg'
          : 'jpg'
    const doc = await payload.create({
      collection: 'media',
      data: { alt },
      // The Media afterChange hook calls `revalidateTag`, which throws outside
      // a Next request store — and a `payload run` seed is exactly that. Skip
      // it: CI builds *after* the seed, so there is nothing to revalidate.
      context: { disableRevalidate: true },
      file: {
        data: buffer,
        mimetype,
        name: `${base}.${ext}`,
        size: buffer.length,
      },
    })
    report.mediaCreated += 1
    return doc.id as number
  }

  payload.logger.info('[seed:e2e] start')

  // 1. Media the home doc references.
  const heroMediaId = await uploadMedia(HERO_IMAGE_URL, 'Brandon Perfetti')
  const photoStripIds: number[] = []
  for (const url of PHOTO_STRIP_URLS) {
    photoStripIds.push(await uploadMedia(url, 'Home gallery photo'))
  }

  // 2. Identity global — feeds the Person JSON-LD and the hero/social rows.
  await payload.updateGlobal({
    slug: 'identity',
    context: { disableRevalidate: true },
    data: {
      name: SITE_OWNER_NAME,
      jobTitle: SITE_OWNER_JOB_TITLE,
      email: 'info@brandonperfetti.com',
      image: heroMediaId,
      sameAs: SITE_OWNER_SOCIAL_LINKS.map((url) => ({ url })),
    },
  })

  // 3. SiteSettings global — site name, canonical origin, default SEO.
  await payload.updateGlobal({
    slug: 'site-settings',
    context: { disableRevalidate: true },
    data: {
      siteName: SITE_OWNER_NAME,
      canonicalUrl: 'https://brandonperfetti.com',
      defaultSeo: {
        title: SITE_OWNER_NAME,
        description:
          'Senior frontend-focused full-stack engineer delivering practical software systems with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows.',
        ogImage: heroMediaId,
      },
    },
  })

  // 4. Published posts so `/articles` renders its search UI (not the empty state).
  const publishedAt = new Date('2026-01-01T12:00:00.000Z').toISOString()
  for (const post of POSTS) {
    const found = await payload.find({
      collection: 'posts',
      where: { slug: { equals: post.slug } },
      limit: 1,
      draft: true,
    })
    const data = {
      title: post.title,
      slug: post.slug,
      slugLock: true,
      excerpt: post.excerpt,
      content: lexicalParagraph(post.excerpt),
      publishedAt,
      access: { visibility: 'public' as const },
      _status: 'published' as const,
    }
    if (found.docs[0]) {
      await payload.update({
        collection: 'posts',
        id: found.docs[0].id,
        data,
        context: { disableRevalidate: true },
      })
    } else {
      await payload.create({
        collection: 'posts',
        data,
        draft: false,
        context: { disableRevalidate: true },
      })
    }
    report.postsUpserted += 1
  }

  // 5. The published `home` doc, carrying the real composed home layout so `/`
  //    renders the true home hero + photo strip + the two-column rail. Media
  //    references use the ids captured above rather than hard-coded numbers, so
  //    the doc is valid on whatever serial ids this fresh DB assigned.
  const homeLayout = [
    {
      blockType: 'photoStrip' as const,
      images: photoStripIds,
      fullBleed: true,
      priority: true,
    },
    {
      blockType: 'container' as const,
      gap: 'homeParity' as const,
      verticalAlign: 'stretch' as const,
      section: {
        width: 'container' as const,
        paddingY: 'none' as const,
        rhythm: 'home' as const,
      },
      columns: [
        {
          blockType: 'column' as const,
          size: 'half' as const,
          content: [
            {
              blockType: 'articlesArchive' as const,
              variant: 'stacked' as const,
              limit: 7,
              revealOnScroll: true,
            },
          ],
        },
        {
          blockType: 'column' as const,
          size: 'half' as const,
          sticky: true,
          contentInset: 'railGutter' as const,
          revealChildren: true,
          content: [
            { blockType: 'contactForm' as const },
            { blockType: 'workHistoryCard' as const },
          ],
        },
      ],
    },
  ]
  const homeData = {
    title: HOME_TITLE,
    subtitle: HOME_SUBTITLE,
    slug: 'home',
    slugLock: true,
    _status: 'published' as const,
    hero: {
      type: 'shader' as const,
      presentation: 'fullBleed' as const,
      shaderPreset: 'northern-lights-2' as const,
      headlineVariant: 'typewriter' as const,
      showSocialLinks: true,
      revealContent: true,
      rhythm: 'homeParity' as const,
      media: heroMediaId,
    },
    layout: homeLayout,
    meta: {
      title: 'Brandon Perfetti — Senior Frontend & Full-Stack Engineer',
      description:
        'Senior frontend-focused full-stack engineer delivering practical software systems with Next.js, TypeScript, GraphQL, and AI SDK + MCP workflows.',
    },
  }
  const foundHome = await payload.find({
    collection: 'pages',
    where: { slug: { equals: 'home' } },
    limit: 1,
    draft: true,
  })
  if (foundHome.docs[0]) {
    await payload.update({
      collection: 'pages',
      id: foundHome.docs[0].id,
      data: homeData as never,
      context: { disableRevalidate: true },
    })
    report.home = 'updated'
  } else {
    await payload.create({
      collection: 'pages',
      data: homeData as never,
      draft: false,
      context: { disableRevalidate: true },
    })
    report.home = 'created'
  }

  // 6. The published `about` doc, carrying the composed About layout so the
  //    flipped `/about` (#44) renders instead of `notFound()`-ing. The portrait
  //    reuses the Identity/person media (`heroMediaId`). The hero is `blank` —
  //    About's H1 lives in the left column's `heading` block, so the hero draws
  //    no `<header>` of its own.
  const aboutImageBase = {
    blockType: 'image' as const,
    media: heroMediaId,
    aspect: 'square' as const,
    rounded: '2xl' as const,
    tilt: 'right' as const,
    hoverScale: true,
  }
  const aboutSocial = {
    blockType: 'socialLinks' as const,
    variant: 'labeledList' as const,
    source: 'identity' as const,
    showEmailDivider: true,
  }
  const aboutLayout = [
    {
      blockType: 'container' as const,
      gap: 'homeParity' as const,
      verticalAlign: 'stretch' as const,
      section: {
        width: 'container' as const,
        paddingY: 'none' as const,
      },
      columns: [
        {
          blockType: 'column' as const,
          size: 'half' as const,
          content: [
            {
              blockType: 'heading' as const,
              text: ABOUT_TITLE,
              level: 'h1' as const,
              variant: 'typewriter' as const,
            },
            {
              blockType: 'lead' as const,
              text: ABOUT_SUBTITLE,
              reveal: true,
            },
            {
              ...aboutImageBase,
              inset: 'none' as const,
              size: 'full' as const,
              visibility: 'mobileOnly' as const,
            },
            {
              blockType: 'prose' as const,
              content: lexicalParagraph(ABOUT_BODY),
            },
            { ...aboutSocial, visibility: 'mobileOnly' as const },
          ],
        },
        {
          blockType: 'column' as const,
          size: 'half' as const,
          sticky: true,
          contentInset: 'aboutRail' as const,
          visibility: 'desktopOnly' as const,
          content: [
            { ...aboutImageBase, inset: 'xs' as const, priority: true },
            { ...aboutSocial },
          ],
        },
      ],
    },
  ]
  const aboutData = {
    title: ABOUT_TITLE,
    subtitle: ABOUT_SUBTITLE,
    slug: 'about',
    slugLock: true,
    _status: 'published' as const,
    hero: { type: 'blank' as const },
    layout: aboutLayout,
    meta: {
      title: 'About — Brandon Perfetti',
      description:
        'Brandon Perfetti is a product and project leader plus software engineer based in Orange County, California.',
    },
  }
  const foundAbout = await payload.find({
    collection: 'pages',
    where: { slug: { equals: 'about' } },
    limit: 1,
    draft: true,
  })
  if (foundAbout.docs[0]) {
    await payload.update({
      collection: 'pages',
      id: foundAbout.docs[0].id,
      data: aboutData as never,
      context: { disableRevalidate: true },
    })
    report.about = 'updated'
  } else {
    await payload.create({
      collection: 'pages',
      data: aboutData as never,
      draft: false,
      context: { disableRevalidate: true },
    })
    report.about = 'created'
  }

  payload.logger.info(
    `[seed:e2e] done: mediaCreated=${report.mediaCreated} postsUpserted=${report.postsUpserted} home=${report.home} about=${report.about}`,
  )
}

// `payload run` kills floating promises after module evaluation — top-level
// await is required (same lesson as the Notion seed and article migration).
try {
  await run()
  process.exit(0)
} catch (err) {
  console.error('[seed:e2e] fatal:', err)
  process.exit(1)
}

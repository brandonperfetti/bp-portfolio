import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { searchPlugin } from '@payloadcms/plugin-search'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { Plugin } from 'payload'

import { publicPathFor } from '@/fields/slug/slugPaths'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { Page, Post } from '@/payload-types'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { searchFields } from '@/search/fieldOverrides'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} - Brandon Perfetti` : 'Brandon Perfetti'
}

/**
 * The absolute URL the SEO plugin shows in its preview and writes into
 * generated metadata.
 *
 * @remarks Delegates to `publicPathFor` rather than repeating the prefix
 * ternary, so the plugin's preview and the URL the site actually serves cannot
 * disagree — including for a placed page (`/work/brytecore`) and for the root
 * page, which this used to advertise as `/home` (#148).
 */
const generateURL: GenerateURL<Post | Page> = ({ doc, collectionSlug }) => {
  const url = getServerSideURL()
  const path = publicPathFor(collectionSlug ?? '', doc ?? {})
  return path ? `${url}${path === '/' ? '' : path}` : url
}

/**
 * Payload plugin wiring (§7): SEO, redirects, search, and the official MCP
 * plugin for Claude-driven content ops.
 *
 * @remarks plugin-form-builder and plugin-nested-docs are intentionally
 * omitted — the custom contact route (`/api/contact`) covers forms and page hierarchy is
 * flat. TODO(brandon): add either later if a real need appears.
 */
export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
    // #130. Without `redirectTypes` the plugin emits no permanence field at
    // all (`plugin-redirects/dist/index.js`: the select field is appended only
    // `...pluginConfig?.redirectTypes ? [redirectSelectField] : []`), so every
    // row served as a 308 and a campaign or a temporarily-moved page could not
    // be expressed. The plugin offers 301/302/303/307/308; only two are
    // configured, because the reader collapses them to permanent-or-not and
    // offering five codes that resolve to two behaviours is a way to make an
    // editor pick wrong. `redirectsRepo.ts` maps 301 to `permanentRedirect`
    // (308) and 302 to `redirect` (307) — Next's App Router APIs emit the
    // modern method-preserving codes, which is the intended behaviour in both
    // cases.
    redirectTypes: ['301', '302'],
    // The plugin builds this field `required: true` with NO default, which
    // would make every existing row invalid on its next save and force a pick
    // on every new one. The default is permanent: that is the right answer for
    // the rename rows `createPathRedirect` writes (the overwhelming majority)
    // and the safe answer for a hand-written one.
    redirectTypeFieldOverride: {
      admin: {
        description:
          'Permanent (301) tells browsers and search engines the move is forever and is cached indefinitely. Temporary (302) is for campaigns and short-lived moves.',
      },
      defaultValue: '301',
    },
    overrides: {
      // @ts-expect-error - valid override; mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description:
                  'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
  mcpPlugin({
    collections: {
      posts: {
        enabled: true,
        description:
          'Articles (drafts + published) served at /articles/[slug].',
      },
      pages: { enabled: true, description: 'Layout-builder pages.' },
      projects: { enabled: true },
      'tech-stack': { enabled: true },
      uses: { enabled: true },
      categories: { enabled: true },
      tags: { enabled: true },
      'work-history': {
        enabled: true,
        description:
          'Résumé entries for the home Work card (company/title/dates/logo/sortOrder). Dates are day-precision timestamps — store noon UTC (T12:00:00.000Z) so admin pickers show the intended calendar day.',
      },
      media: { enabled: { create: true, find: true, update: true } },
    },
  }),
]

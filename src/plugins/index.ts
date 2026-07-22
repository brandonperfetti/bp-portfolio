import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { searchPlugin } from '@payloadcms/plugin-search'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { Plugin } from 'payload'

import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { Page, Post } from '@/payload-types'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { searchFields } from '@/search/fieldOverrides'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} - Brandon Perfetti` : 'Brandon Perfetti'
}

const generateURL: GenerateURL<Post | Page> = ({ doc, collectionSlug }) => {
  const url = getServerSideURL()
  if (!doc?.slug) return url
  return collectionSlug === 'posts'
    ? `${url}/articles/${doc.slug}`
    : `${url}/${doc.slug}`
}

/**
 * Payload plugin wiring (§7): SEO, redirects, search, and the official MCP
 * plugin for Claude-driven content ops.
 *
 * @remarks plugin-form-builder and plugin-nested-docs are intentionally
 * omitted — the SendGrid contact route is retained and page hierarchy is
 * flat. TODO(brandon): add either later if a real need appears.
 */
export const plugins: Plugin[] = [
  redirectsPlugin({
    collections: ['pages', 'posts'],
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
      media: { enabled: { create: true, find: true, update: true } },
    },
  }),
]

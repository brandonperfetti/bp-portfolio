import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'tanstack.com',
      },
      {
        protocol: 'https',
        hostname: 'playwright.dev',
      },
      {
        protocol: 'https',
        hostname: 'pinia.vuejs.org',
      },
      {
        protocol: 'https',
        hostname: 'testing-library.com',
      },
      {
        protocol: 'https',
        hostname: 'zod.dev',
      },
    ],
    localPatterns: [
      { pathname: '/api/media/file/**' },
      { pathname: '/_next/**' },
      { pathname: '/images/**' },
    ],
  },
  // The `home` page-builder document renders at `/` via the dedicated home
  // route (#42). `/home` is not a second copy of it: this 308 permanent
  // redirect sends `/home` to the canonical `/` before the `[slug]` catch-all
  // can render it, which is why `home` is no longer a RESERVED_PAGE_SLUGS entry
  // (src/lib/cms/pagesRepo.ts). A redirect (not a 404) preserves any inbound
  // links and link equity to the old `/home` URL.
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ]
  },
}

export default withPayload(nextConfig)

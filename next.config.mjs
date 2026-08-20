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

const configuredNextConfig = withPayload(nextConfig)

// Sentry (#73) is entirely env-gated on a DSN being present, mirroring the
// Resend/Blob pattern above `db:`/`plugins:` in `src/payload.config.ts`.
// With no NEXT_PUBLIC_SENTRY_DSN/SENTRY_DSN, `@sentry/nextjs` is never even
// imported (dynamic import below, only reached inside the `if`) — local dev
// and CI build with zero Sentry build-time instrumentation (no tunnel
// rewrite, no source-map upload attempt, no added bundle weight) and don't
// need the dependency installed at all to boot, not just a runtime no-op.
const sentryDsnConfigured = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
)

let finalNextConfig = configuredNextConfig

if (sentryDsnConfigured) {
  const { withSentryConfig } = await import('@sentry/nextjs')
  finalNextConfig = withSentryConfig(configuredNextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // CI/Vercel-only secret; the plugin skips source-map upload
    // gracefully (a warning, not a build failure) when it's absent, so a
    // DSN-configured-but-token-less preview build still succeeds.
    authToken: process.env.SENTRY_AUTH_TOKEN,
    // Route browser events through our own origin so ad-blockers that
    // block *.sentry.io/ingest don't eat them (#73 acceptance).
    tunnelRoute: '/monitoring',
    // Only Sentry's own upload-progress logging is noisy in a local
    // `next build`; let CI see it.
    silent: !process.env.CI,
    widenClientFileUpload: true,
    // Never fail the app build over a Sentry upload hiccup (network blip,
    // misconfigured token) — warn and continue.
    errorHandler: (error) => {
      console.warn('[sentry] next.config build step warning:', error)
    },
    // Defaults first (#73): explicitly no Vercel Cron Monitor
    // auto-registration (this app builds with Turbopack, not webpack, so
    // the SDK's webpack.treeshake debug-logging options don't apply here).
    automaticVercelMonitors: false,
  })
}

export default finalNextConfig

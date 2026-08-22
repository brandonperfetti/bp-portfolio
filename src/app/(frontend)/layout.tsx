import { type Metadata } from 'next'

import { Providers } from '@/app/(frontend)/providers'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { Layout } from '@/components/Layout'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getSiteUrl } from '@/lib/site'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

import '@/styles/tailwind.css'

export async function generateMetadata(): Promise<Metadata> {
  const defaults = await getCmsSiteSettings()
  const siteUrl = defaults.canonicalUrl || getSiteUrl()

  return {
    metadataBase: new URL(siteUrl),
    title: {
      template: `%s - ${defaults.siteName}`,
      default: defaults.siteTitle,
    },
    description: defaults.siteDescription,
    keywords: defaults.keywords,
    alternates: {
      canonical: siteUrl,
      types: {
        'application/rss+xml': `${siteUrl}/feed.xml`,
      },
    },
    // Home-screen/browser-tab identity: PNG favicons + the apple-touch-icon
    // iOS reads for add-to-home-screen (Android icons live in manifest.ts;
    // src/app/favicon.ico is auto-served by Next's file convention).
    icons: {
      icon: [
        {
          url: '/assets/favicons/favicon-32x32.png',
          sizes: '32x32',
          type: 'image/png',
        },
        {
          url: '/assets/favicons/favicon-16x16.png',
          sizes: '16x16',
          type: 'image/png',
        },
      ],
      apple: '/assets/favicons/apple-touch-icon.png',
    },
    openGraph: {
      type: 'website',
      url: siteUrl,
      siteName: defaults.siteName,
      title: defaults.siteTitle,
      description: defaults.siteDescription,
      images: defaults.openGraphImage
        ? [{ url: defaults.openGraphImage }]
        : undefined,
    },
    twitter: {
      card: defaults.twitterCard ?? 'summary_large_image',
      title: defaults.siteTitle,
      description: defaults.siteDescription,
      images: defaults.openGraphImage ? [defaults.openGraphImage] : undefined,
    },
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // `overflow-x-clip` is what lets a full-bleed container section use
    // `w-screen` (100vw, which counts a classic scrollbar) without producing a
    // horizontal scrollbar of its own. `clip` rather than `hidden` on purpose:
    // it clips without becoming a scroll container, so the sticky header and
    // sticky columns keep sticking to the viewport.
    <html
      lang="en"
      className="h-full overflow-x-clip antialiased"
      suppressHydrationWarning
    >
      <body className="flex h-full bg-zinc-50 dark:bg-black">
        <AuthProvider>
          <Providers>
            <div className="flex w-full">
              <Layout>{children}</Layout>
              <Analytics />
              <SpeedInsights />
            </div>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  )
}

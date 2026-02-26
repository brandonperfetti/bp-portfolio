import { type Metadata } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getSiteUrl } from '@/lib/site'

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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex h-full bg-zinc-50 dark:bg-black">
        <Providers>
          <div className="flex w-full">
            <Layout>{children}</Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}

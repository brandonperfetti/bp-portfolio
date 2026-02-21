import { type Metadata } from 'next'

import { Providers } from '@/app/providers'
import { Layout } from '@/components/Layout'
import { getSiteUrl } from '@/lib/site'

import '@/styles/tailwind.css'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    template: '%s - Brandon Perfetti',
    default:
      'Brandon Perfetti - Product & Project Manager and Software Engineer',
  },
  description:
    'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.',
  alternates: {
    canonical: './',
    types: {
      'application/rss+xml': `${siteUrl}/feed.xml`,
    },
  },
  openGraph: {
    type: 'website',
    url: siteUrl,
    siteName: 'Brandon Perfetti',
    title: 'Brandon Perfetti - Product & Project Manager and Software Engineer',
    description:
      'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Brandon Perfetti - Product & Project Manager and Software Engineer',
    description:
      'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.',
  },
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

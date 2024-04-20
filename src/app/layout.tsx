import { Providers } from '@/app/providers'
import { Layout } from '@/components/common'
import '@/styles/tailwind.css'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { type Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    template: '%s - Brandon Perfetti',
    default:
      'Brandon Perfetti - Product & Project Manager, Software Engineer, and Continuous Learner',
  },
  description:
    'I’m Brandon, based in the beautiful Orange County, CA. My passion lies in crafting solutions that not only solve complex problems but also significantly improve user interactions and business processes. A continual learner, I thrive on exploring new technologies and methodologies to stay ahead in the ever-evolving tech landscape.',
  alternates: {
    types: {
      'application/rss+xml': `${process.env.NEXT_PUBLIC_SITE_URL}/feed.xml`,
    },
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
            <Layout>
              {children}
              <Analytics />
              <SpeedInsights />
            </Layout>
          </div>
        </Providers>
      </body>
    </html>
  )
}

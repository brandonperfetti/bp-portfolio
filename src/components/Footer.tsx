'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ContainerInner, ContainerOuter } from '@/components/Container'
import type { CmsNavigationItem } from '@/lib/cms/types'
import { getExternalLinkProps } from '@/lib/link-utils'
import { PRIMARY_NAV_LINKS } from '@/lib/navigation'

function NavLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      {...getExternalLinkProps(href)}
      className="rounded-md px-1.5 py-0.5 transition hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:hover:text-teal-400 dark:focus-visible:ring-teal-400/80"
    >
      {children}
    </Link>
  )
}

/**
 * Default site footer using the static nav fallback — exists so layouts can
 * drop in a footer without threading CMS navigation through props.
 */
export function Footer() {
  const defaultNavigationItems: Array<
    Pick<CmsNavigationItem, 'href' | 'label'>
  > = PRIMARY_NAV_LINKS
  return <FooterWithNavigation navigationItems={defaultNavigationItems} />
}

/**
 * Machine-readable surfaces the site publishes for agents and crawlers.
 *
 * @remarks Every target already exists and is discoverable by convention
 * (robots.txt names the sitemap; `/llms.txt` sits at its well-known path;
 * the feed is a `<link rel="alternate">`) — these anchors add link-based
 * crawl discovery and a human-visible affordance, mirroring the pattern on
 * agent-forward sites. Per docs/SEO.md, any new content-bearing surface
 * must be added here alongside the sitemap/llms registrations.
 */
const AGENT_LINKS = [
  { href: '/llms.txt', label: 'llms.txt' },
  { href: '/llms-full.txt', label: 'llms-full.txt' },
  { href: '/sitemap.xml', label: 'sitemap.xml' },
  { href: '/feed.xml', label: 'rss.xml' },
] as const

/**
 * Footer with caller-supplied (CMS-driven) navigation items.
 *
 * @remarks Renders nothing on `/corvus` — the chat surface owns its full
 * viewport and a footer would push the composer off-screen.
 */
export function FooterWithNavigation({
  navigationItems,
}: {
  navigationItems: Array<Pick<CmsNavigationItem, 'href' | 'label'>>
}) {
  const pathname = usePathname()

  if (pathname === '/corvus') {
    return null
  }

  return (
    <footer className="mt-10 flex-none sm:mt-12">
      <ContainerOuter>
        <div className="border-t border-zinc-100 py-6 dark:border-zinc-700/40">
          <ContainerInner>
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {navigationItems.map((item) => (
                  <NavLink key={item.href} href={item.href}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                &copy; {new Date().getFullYear()} Brandon Perfetti. All rights
                reserved.
              </p>
            </div>
            <nav
              aria-label="Machine-readable resources"
              className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-xs text-zinc-400 sm:justify-start dark:text-zinc-500"
            >
              <span aria-hidden="true">Agents</span>
              {AGENT_LINKS.map((item) => (
                // Plain anchors on purpose: these are route handlers serving
                // text/XML documents, not app pages — client-side Link
                // navigation (and its prefetch) is wrong for them.
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-1 py-0.5 transition hover:text-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:hover:text-teal-400 dark:focus-visible:ring-teal-400/80"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  )
}

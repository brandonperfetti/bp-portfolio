'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { ContainerInner, ContainerOuter } from '@/components/Container'
import type { CmsNavigationItem } from '@/lib/cms/types'
import { getExternalLinkProps } from '@/lib/link-utils'

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
      className="transition hover:text-teal-500 dark:hover:text-teal-400"
    >
      {children}
    </Link>
  )
}

export function Footer() {
  const defaultNavigationItems: Array<Pick<CmsNavigationItem, 'href' | 'label'>> =
    [
      { href: '/about', label: 'About' },
      { href: '/articles', label: 'Articles' },
      { href: '/projects', label: 'Projects' },
      { href: '/tech', label: 'Tech' },
      { href: '/uses', label: 'Uses' },
    ]
  return <FooterWithNavigation navigationItems={defaultNavigationItems} />
}

export function FooterWithNavigation({
  navigationItems,
}: {
  navigationItems: Array<Pick<CmsNavigationItem, 'href' | 'label'>>
}) {
  const pathname = usePathname()

  if (pathname === '/hermes') {
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
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                &copy; {new Date().getFullYear()} Brandon Perfetti. All rights
                reserved.
              </p>
            </div>
          </ContainerInner>
        </div>
      </ContainerOuter>
    </footer>
  )
}

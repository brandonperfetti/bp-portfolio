export type NavigationLink = {
  href: string
  label: string
}

// Shared primary nav set used across footer and llms primary pages.
export const PRIMARY_NAV_LINKS: NavigationLink[] = [
  { href: '/about', label: 'About' },
  { href: '/articles', label: 'Articles' },
  { href: '/projects', label: 'Projects' },
  { href: '/tech', label: 'Tech' },
  { href: '/uses', label: 'Uses' },
]

// Header includes Hermes in addition to primary links.
export const HEADER_NAV_LINKS: NavigationLink[] = [
  ...PRIMARY_NAV_LINKS.slice(0, 4),
  { href: '/hermes', label: 'Hermes' },
  ...PRIMARY_NAV_LINKS.slice(4),
]

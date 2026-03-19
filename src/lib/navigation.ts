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
const HERMES_LINK: NavigationLink = { href: '/hermes', label: 'Hermes' }
// Keep Hermes placement explicit and tied to PRIMARY_NAV_LINKS order:
// index 3 currently corresponds to "Tech".
const INSERT_HERMES_AFTER_INDEX = 3
const hermesInsertIndex =
  INSERT_HERMES_AFTER_INDEX >= 0 &&
  INSERT_HERMES_AFTER_INDEX < PRIMARY_NAV_LINKS.length
    ? INSERT_HERMES_AFTER_INDEX + 1
    : PRIMARY_NAV_LINKS.length

export const HEADER_NAV_LINKS: NavigationLink[] = [
  ...PRIMARY_NAV_LINKS.slice(0, hermesInsertIndex),
  HERMES_LINK,
  ...PRIMARY_NAV_LINKS.slice(hermesInsertIndex),
]

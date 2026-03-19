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
const INSERT_HERMES_AFTER_LABEL = 'Tech'
const insertAfterIndex = PRIMARY_NAV_LINKS.findIndex(
  (item) => item.label === INSERT_HERMES_AFTER_LABEL,
)
const hermesInsertIndex =
  insertAfterIndex >= 0 ? insertAfterIndex + 1 : PRIMARY_NAV_LINKS.length

export const HEADER_NAV_LINKS: NavigationLink[] = [
  ...PRIMARY_NAV_LINKS.slice(0, hermesInsertIndex),
  HERMES_LINK,
  ...PRIMARY_NAV_LINKS.slice(hermesInsertIndex),
]

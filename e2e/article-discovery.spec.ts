import { expect, test } from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * Reader journey: find an article by searching, read it, come back.
 *
 * @remarks Asserts identity, not URL syntax: the search narrows the list to
 * the one seeded article it should match, the click lands on that article,
 * and Back and reload both restore the same query **and** the same narrowed
 * list. `ui-regression.spec.ts` only proves typing reaches the URL; the
 * component tier proves Back/Forward sync against a mocked router (#267,
 * #302). This is the real-browser, real-navigation version.
 *
 * It depends on the deterministic `pnpm seed:e2e` posts
 * (`scripts/seed-e2e.ts`, `POSTS`). Under `CI` — the Build · E2E job and the
 * owned-instance recipe in `docs/TESTING.md`, both of which seed — a missing
 * fixture **fails** the test rather than skipping it, so a green CI run always
 * means these assertions ran. Without `CI` (e.g. a production restore with
 * other articles, or an empty corpus) it skips with {@link SKIP_REASON}.
 * Playwright's terminal output does not print skip reasons, so read them from
 * the JSON report (`docs/TESTING.md` § Verifying a journey locally, step 5)
 * before treating a local run as evidence.
 */

/** The seeded article the query must find, and only it. */
const TARGET = {
  slug: 'react-server-components-in-practice',
  title: 'React Server Components in practice',
}

/** Seeded articles the query must exclude. */
const OTHERS = [
  'Shipping reliable software with small, focused changes',
  'Product-minded engineering',
]

/** Matches the target's title and excerpt only, among the seeded posts. */
const QUERY = 'server components'

const SKIP_REASON =
  'article-discovery: seeded e2e posts absent (run `pnpm seed:e2e`); this run proves nothing about the journey.'

test('search finds an article, opening it and coming back keeps the search', async ({
  page,
}) => {
  await page.goto('/articles')
  const searchInput = page.getByPlaceholder('Search articles')
  const results = page.getByRole('region', { name: 'Article results' })
  const cardLink = (title: string) =>
    results.getByRole('link', { name: `Read article: ${title}` })

  // An empty corpus renders the empty state instead of the explorer.
  const emptyState = page.getByText('No published articles')
  await expect(searchInput.or(emptyState)).toBeVisible()
  // Every fixture must be present: a partial corpus cannot prove the
  // narrowing either, so it takes the same CI-fail / local-skip path.
  let seeded = !(await emptyState.isVisible())
  for (const title of [TARGET.title, ...OTHERS]) {
    if (seeded) seeded = (await cardLink(title).count()) > 0
  }
  if (!seeded) {
    if (process.env.CI) throw new Error(SKIP_REASON)
    test.skip(true, SKIP_REASON)
  }
  for (const title of OTHERS) await expect(cardLink(title)).toBeVisible()

  // Search: the URL carries the query and the list narrows to the target.
  await interactUntil(async () => {
    await searchInput.fill(QUERY)
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 2000 })
      .toBe(QUERY)
  })
  await expect(cardLink(TARGET.title)).toBeVisible()
  for (const title of OTHERS) await expect(cardLink(title)).toHaveCount(0)

  // Open it: a real navigation to that article's page.
  await cardLink(TARGET.title).click()
  await expect(page).toHaveURL(new RegExp(`/articles/${TARGET.slug}$`))
  await expect(
    page.getByRole('heading', { level: 1, name: TARGET.title }),
  ).toBeVisible()

  // Back: same query in the box, same narrowed list.
  await page.goBack()
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(QUERY)
  await expect(searchInput).toHaveValue(QUERY)
  await expect(cardLink(TARGET.title)).toBeVisible()
  for (const title of OTHERS) await expect(cardLink(title)).toHaveCount(0)

  // Reload: the URL alone restores it.
  await page.reload()
  await expect(searchInput).toHaveValue(QUERY)
  await expect(cardLink(TARGET.title)).toBeVisible()
  for (const title of OTHERS) await expect(cardLink(title)).toHaveCount(0)
})

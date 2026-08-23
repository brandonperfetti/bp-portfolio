import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Automated a11y sweep (§13 acceptance criteria): axe-core over the primary
 * routes in both themes. Serious/critical violations fail; moderate and
 * minor are surfaced in the report for manual triage.
 *
 * The shader canvas is aria-hidden decoration and axe ignores it; color
 * contrast is checked against the rendered theme, which is why both themes
 * are swept.
 */
const ROUTES = ['/', '/articles', '/tech', '/uses', '/corvus']
const THEMES = ['light', 'dark'] as const

/** Severities that fail the build (§13). */
const BLOCKING_IMPACTS = new Set(['serious', 'critical'])

for (const theme of THEMES) {
  for (const route of ROUTES) {
    test(`axe: ${route} (${theme})`, async ({ page }) => {
      // Reduced motion makes every scroll-reveal render statically, so axe
      // sees (and checks) all content, including below-the-fold cards.
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(600)

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      const blocking = results.violations.filter((violation) =>
        BLOCKING_IMPACTS.has(violation.impact ?? ''),
      )

      expect(
        blocking,
        blocking
          .map(
            (violation) =>
              `${violation.id} (${violation.impact}): ${violation.help} → ` +
              violation.nodes
                .slice(0, 3)
                .map((node) => node.target.join(' '))
                .join(' | '),
          )
          .join('\n'),
      ).toEqual([])
    })
  }
}

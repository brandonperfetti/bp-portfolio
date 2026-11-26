import { describe, expect, it } from 'vitest'

import typographyConfig from '../../typography'

type TypographyFn = (helpers: {
  theme: (path: string) => string
}) => Record<string, { css: Record<string, unknown> }>

/**
 * Pins the reading-measure decision on #196 (Brandon, 2026-11-26): a 65ch
 * cap in the site's own `DEFAULT.css`, with the override kept under `theme`.
 * The reasons are in the `typography.ts` remarks.
 */
describe('typography.ts', () => {
  // The real `PluginUtils` is wider than the one helper the config calls;
  // `theme` alone is enough to evaluate it.
  const config = typographyConfig as unknown as {
    theme: { typography?: TypographyFn; extend?: Record<string, unknown> }
  }
  const styles = () =>
    (config.theme.typography as TypographyFn)({ theme: (path) => path })

  it('caps prose at a 65ch reading measure', () => {
    expect(styles().DEFAULT.css.maxWidth).toBe('65ch')
  })

  it('keeps the override under theme, not theme.extend', () => {
    expect(typeof config.theme.typography).toBe('function')
    expect(config.theme.extend?.typography).toBeUndefined()
  })
})

import type { StorybookConfig } from '@storybook/nextjs-vite'

/**
 * Storybook 10 on the Next.js + Vite framework (§11).
 *
 * `@storybook/addon-mcp` exposes the component manifest at `/mcp` while the
 * dev server runs (`pnpm storybook`), so agents reuse these components
 * instead of reinventing them. a11y addon enforces the §13 acceptance
 * criteria per story.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-mcp'],
  framework: '@storybook/nextjs-vite',
  staticDirs: ['../public'],
  viteFinal: async (viteConfig) => {
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const here = path.dirname(fileURLToPath(import.meta.url))
    const stub = path.resolve(here, './serverBlockStubs.tsx')
    viteConfig.resolve = viteConfig.resolve ?? {}
    viteConfig.resolve.alias = {
      ...(viteConfig.resolve.alias ?? {}),
      // Server blocks reach the Payload Local API — swap for visual stubs.
      '@/blocks/ArticlesArchive/Component': stub,
      '@/blocks/WorkHistoryCard/Component': stub,
    }
    return viteConfig
  },
}

export default config

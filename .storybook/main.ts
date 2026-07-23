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
}

export default config

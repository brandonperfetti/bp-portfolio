import type { StorybookConfig } from '@storybook/nextjs-vite'

/**
 * Storybook 10 on the Next.js + Vite framework (§11).
 *
 * `@storybook/addon-mcp` exposes the component manifest at `/mcp` while the
 * dev server runs (`pnpm storybook`), so agents reuse these components
 * instead of reinventing them. a11y addon enforces the §13 acceptance
 * criteria per story. addon-vitest turns stories (and their play
 * functions) into browser-mode Vitest tests — `pnpm test:storybook`.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|mdx)'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-mcp',
    '@storybook/addon-vitest',
  ],
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
      '@/blocks/SocialLinks/Component': stub,
    }
    // #162. `ai` (the Vercel AI SDK, a real client dependency of CorvusChat —
    // `DefaultChatTransport`) imports `@opentelemetry/api`, which this
    // framework resolves to Next's ncc-compiled copy
    // (`next/dist/compiled/@opentelemetry/api`, it is in the framework's
    // `optimizeDeps` list). That bundle ends with a Node-only bootstrap line,
    // `__nccwpck_require__.ab = __dirname + '/'`, which is dead code in a
    // browser but still evaluated at module scope — so every AI/CorvusChat
    // story threw `ReferenceError: __dirname is not defined` at import and
    // rendered nothing in the canvas. Nothing in our source can be un-imported
    // to avoid it, so the shim is defined away here, at the bundler layer.
    //
    // Twin: `vitest.config.ts` carries the identical `define` for the
    // `storybook` browser-mode project. That duplication is why this went
    // unnoticed — the vitest tier was green while the human-facing canvas was
    // broken. Keep the two values in step; if one changes, change both.
    viteConfig.define = {
      ...(viteConfig.define ?? {}),
      __dirname: JSON.stringify('/'),
    }
    return viteConfig
  },
}

export default config

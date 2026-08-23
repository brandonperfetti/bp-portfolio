import type { Decorator, Preview } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import React from 'react'

// Tailwind v4 entry (global @theme tokens + shadcn/ui variables + prism).
import '../src/styles/tailwind.css'

/**
 * Mirrors the app's `Providers` theming: next-themes with class attribute.
 * The `theme` toolbar global drives light/dark so both variants are
 * reviewable per story (light/dark parity is an acceptance criterion, §13).
 */
function ThemeFrame({
  theme,
  children,
}: {
  theme: string
  children: React.ReactNode
}) {
  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
  }, [theme])

  return (
    <ThemeProvider
      attribute="class"
      forcedTheme={theme}
      disableTransitionOnChange
    >
      <div className="bg-white p-6 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
        {children}
      </div>
    </ThemeProvider>
  )
}

const withTheme: Decorator = (Story, context) => (
  <ThemeFrame theme={(context.globals.theme as string) ?? 'light'}>
    <Story />
  </ThemeFrame>
)

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Fail CI on serious/critical a11y violations (§13).
      test: 'error',
    },
    nextjs: {
      // App Router mocks (next/navigation useRouter etc.) — without this
      // the framework mounts the Pages Router mock and any component
      // calling useRouter throws "expected app router to be mounted".
      appDirectory: true,
    },
  },
  globalTypes: {
    theme: {
      description: 'Color scheme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
  },
  decorators: [withTheme],
}

export default preview

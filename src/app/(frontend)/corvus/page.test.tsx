import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// #76 B3: the Corvus page keeps its indexed static shell (title/subtitle +
// CmsPageBlocks) and Suspense-isolates the client chat. CorvusChat (useChat →
// Math.random) is stubbed as a probe; the render asserts the shell wraps it.
vi.mock('@/components/CorvusChat', () => ({
  default: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div
      data-testid="corvus-chat"
      data-title={title}
      data-subtitle={subtitle}
    />
  ),
}))
vi.mock('@/components/cms/CmsPageBlocks', () => ({
  CmsPageBlocks: () => <div data-testid="cms-page-blocks" />,
}))
vi.mock('@/lib/cms/pagesRepo', () => ({
  getCmsPageByPath: vi.fn(async () => ({
    title: 'Corvus',
    subtitle: 'Ask me anything',
  })),
}))
vi.mock('@/lib/cms/siteSettingsRepo', () => ({
  getCmsSiteSettings: vi.fn(async () => ({})),
}))

import CorvusPage from '@/app/(frontend)/corvus/page'

describe('CorvusPage shell + Suspense-isolated chat (#76 B3)', () => {
  it('renders the CMS-driven shell with CorvusChat isolated inside it', async () => {
    render(await CorvusPage())

    const chat = screen.getByTestId('corvus-chat')
    expect(chat).toHaveAttribute('data-title', 'Corvus')
    expect(chat).toHaveAttribute('data-subtitle', 'Ask me anything')
    // The indexed shell (page blocks) prerenders alongside the isolated chat.
    expect(screen.getByTestId('cms-page-blocks')).toBeInTheDocument()
  })
})

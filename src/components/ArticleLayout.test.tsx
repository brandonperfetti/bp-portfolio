import { forwardRef } from 'react'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ArticleLayout } from '@/components/ArticleLayout'

/**
 * #92 regression coverage: on iOS Safari the priority hero image is
 * frequently already `complete` (fetched/decoded from Next's preload link,
 * or from cache) before React hydration attaches the `onLoad` handler. The
 * native load event is one-shot — it already fired on the pre-hydration DOM
 * node — so `onLoad` never runs and, without the mount-time `complete`
 * check in `ArticleLayout`, the hero would stay hidden forever. These tests
 * simulate that race directly: they never dispatch a load/error event and
 * instead control `HTMLImageElement.prototype.complete`, the same property
 * the fix reads.
 */

/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
vi.mock('next/image', () => ({
  default: forwardRef<HTMLImageElement, Record<string, unknown>>(
    function MockNextImage(props, ref) {
      return <img ref={ref} {...props} />
    },
  ),
}))
/* eslint-enable @next/next/no-img-element, jsx-a11y/alt-text */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn() }),
}))

vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock('@/components/motion/AnimatedHeadline', () => ({
  AnimatedHeadline: ({
    text,
    className,
  }: {
    text: string
    className?: string
  }) => <h1 className={className}>{text}</h1>,
}))

const article = {
  title: 'A great article',
  date: '2026-01-01',
  image: 'https://example.public.blob.vercel-storage.com/cover.png',
}

// jsdom implements `complete` as a read-only accessor on the prototype. Capture
// its native descriptor once (before any test overrides it) so afterEach can
// restore it — deleting the property would strip jsdom's accessor for every
// later test in this file (Vitest isolates files, not tests within a file).
const originalCompleteDescriptor = Object.getOwnPropertyDescriptor(
  HTMLImageElement.prototype,
  'complete',
)

/** Forces every `<img>`'s `.complete` read to return `value` for the test. */
function stubImageComplete(value: boolean) {
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get: () => value,
  })
}

afterEach(() => {
  cleanup()
  if (originalCompleteDescriptor) {
    Object.defineProperty(
      HTMLImageElement.prototype,
      'complete',
      originalCompleteDescriptor,
    )
  } else {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'complete')
  }
})

describe('ArticleLayout hero image reveal', () => {
  it('reveals the hero on mount when the image is already complete, even though onLoad never fires', () => {
    // The pre-hydration race: the browser already finished loading/decoding
    // the image (preload link, cache) before React attached `onLoad` — so
    // `onLoad` is never going to fire in this test, by design.
    stubImageComplete(true)

    render(<ArticleLayout article={article}>body</ArticleLayout>)

    const img = screen.getByRole('img', { name: article.title })
    expect(img.className).toContain('opacity-100')
    expect(img.className).not.toContain('opacity-0')
  })

  it('keeps the hero hidden until onLoad fires when the image is not yet complete on mount', () => {
    stubImageComplete(false)

    render(<ArticleLayout article={article}>body</ArticleLayout>)

    const img = screen.getByRole('img', { name: article.title })
    expect(img.className).toContain('opacity-0')

    fireEvent.load(img)

    expect(img.className).toContain('opacity-100')
  })

  it('reveals the hero on a load failure via onError, as a fallback', () => {
    stubImageComplete(false)

    render(<ArticleLayout article={article}>body</ArticleLayout>)

    const img = screen.getByRole('img', { name: article.title })
    expect(img.className).toContain('opacity-0')

    fireEvent.error(img)

    expect(img.className).toContain('opacity-100')
  })

  it('does not render a hero at all when the article has no image', () => {
    render(
      <ArticleLayout article={{ title: 'No cover', date: '2026-01-01' }}>
        body
      </ArticleLayout>,
    )

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

// The reader's mapping, with `getPayload` returning a fake `findGlobal` and
// the `'use cache'` primitives recorded, as in `siteSettingsRepo.test.ts`.
// That the reader passes `overrideAccess: false` is pinned beside the other
// global readers in `globalReaders.access.test.ts`; its tag, against the
// vocabulary, in `cacheTags.test.ts`.
const findGlobal = vi.fn()
const cacheTag = vi.fn()
const cacheLife = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ findGlobal })),
}))
vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => cacheTag(...tags),
  cacheLife: (profile: unknown) => cacheLife(profile),
}))

import {
  getCmsFooterLinks,
  getCmsFooterLinksOrNone,
} from '@/lib/cms/footerRepo'

beforeEach(() => {
  findGlobal.mockReset()
  cacheTag.mockReset()
  cacheLife.mockReset()
})

describe('getCmsFooterLinks (#363)', () => {
  it('returns the footer global’s links in their saved order', async () => {
    findGlobal.mockResolvedValue({
      links: [
        { id: 'a', label: 'Privacy', href: '/privacy' },
        { id: 'b', label: 'GitHub', href: 'https://github.com/example' },
      ],
    })

    await expect(getCmsFooterLinks()).resolves.toEqual([
      { label: 'Privacy', href: '/privacy' },
      { label: 'GitHub', href: 'https://github.com/example' },
    ])
  })

  it.each([
    ['an empty array', { links: [] }],
    ['a missing field', {}],
    ['a null field', { links: null }],
    ['an unseeded global', null],
  ])(
    'returns no links for %s, so the footer renders as it did',
    async (_l, global) => {
      findGlobal.mockResolvedValue(global)

      await expect(getCmsFooterLinks()).resolves.toEqual([])
    },
  )

  it('trims, and drops a row with a blank label or href', async () => {
    findGlobal.mockResolvedValue({
      links: [
        { label: '  Privacy  ', href: ' /privacy ' },
        { label: '   ', href: '/blank-label' },
        { label: 'Blank href', href: '' },
        { label: null, href: '/null-label' },
      ],
    })

    await expect(getCmsFooterLinks()).resolves.toEqual([
      { label: 'Privacy', href: '/privacy' },
    ])
  })

  it('keeps site paths, http(s) and mailto links, and drops any other scheme', async () => {
    findGlobal.mockResolvedValue({
      links: [
        { label: 'Path', href: '/privacy' },
        { label: 'Https', href: 'https://example.test/x' },
        { label: 'Http', href: 'http://example.test/x' },
        { label: 'Mail', href: 'mailto:hello@example.test' },
        { label: 'Script', href: 'javascript:alert(1)' },
        { label: 'Data', href: 'data:text/html,<p>x</p>' },
        { label: 'Protocol-relative', href: '//example.test/x' },
        { label: 'Bare word', href: 'privacy' },
        { label: 'Scheme only', href: 'https://' },
        { label: 'Backslash host', href: '/\\evil.example' },
        { label: 'Backslash in URL', href: 'https:\\\\evil.example' },
        { label: 'Tab inside', href: '/\t/evil.example' },
        { label: 'Newline inside', href: '/pri\nvacy' },
        { label: 'Bracket piece in query', href: '/about?ref=/[campaign]' },
        { label: 'Bracket piece in path', href: '/articles/[slug]' },
        {
          label: 'Bracket piece off-site',
          href: 'https://example.test/[campaign]',
        },
        {
          label: 'Bracket piece in off-site query',
          href: 'https://example.test/a?ref=/[campaign]',
        },
        { label: 'Bare mailto', href: 'mailto:' },
        { label: 'Mailto with only a subject', href: 'mailto:?subject=Hi' },
      ],
    })

    const links = await getCmsFooterLinks()

    expect(links.map((link) => link.label)).toEqual([
      'Path',
      'Https',
      'Http',
      'Mail',
    ])
  })

  it('keeps ordinary links with queries, fragments, encoded brackets and mail subjects', async () => {
    const kept = [
      { label: 'Query', href: '/articles?topic=react&page=2' },
      { label: 'Fragment', href: '/about#contact' },
      { label: 'Encoded brackets', href: '/about?ref=%5Bcampaign%5D' },
      { label: 'Unicode path', href: '/über-mich' },
      {
        label: 'Mail with subject',
        href: 'mailto:hello@example.test?subject=Hello',
      },
      { label: 'External with brackets', href: 'https://example.test/a?b=[c]' },
      { label: 'Site path with brackets', href: '/about?ref=[campaign]' },
    ]
    findGlobal.mockResolvedValue({ links: kept })

    await expect(getCmsFooterLinks()).resolves.toEqual(kept)
  })

  it('agrees with Next’s own <Link> check on every href it lets through or drops', async () => {
    // The reader's bracket rule exists only because Next's app-router Link
    // throws on some hrefs in development. This is that check, as written in
    // next/dist/client/app-dir/link.js: if the two ever disagree, a saved
    // link can take the footer down again.
    const nextLinkWouldThrow = (href: string) =>
      href
        .split('/')
        .some((segment) => segment.startsWith('[') && segment.endsWith(']'))
    const candidates = [
      '/privacy',
      '/about?ref=[campaign]',
      '/about?ref=/[campaign]',
      '/articles/[slug]',
      '/[...segments]',
      'https://example.test/[campaign]',
      'https://example.test/a?ref=/[campaign]',
      'https://example.test/a?b=[c]',
      'mailto:hello@example.test?subject=[hi]',
    ]
    findGlobal.mockResolvedValue({
      links: candidates.map((href) => ({ label: href, href })),
    })

    const rendered = (await getCmsFooterLinks()).map((link) => link.href)

    expect(rendered).toEqual(candidates.filter((h) => !nextLinkWouldThrow(h)))
    expect(rendered.some(nextLinkWouldThrow)).toBe(false)
  })

  it('getCmsFooterLinksOrNone renders no links, and says so, when the read fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    findGlobal.mockRejectedValue(new Error('connection terminated'))

    await expect(getCmsFooterLinksOrNone()).resolves.toEqual([])
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('footer links read failed'),
      { message: 'connection terminated' },
    )
    // The cached reader itself still rejects: the fallback must not be what
    // gets cached.
    await expect(getCmsFooterLinks()).rejects.toThrow('connection terminated')
    error.mockRestore()
  })

  it('getCmsFooterLinksOrNone lets a Next control signal through instead of treating it as a failure', async () => {
    // Next ends a prerender and bails out to dynamic rendering by throwing.
    // `unstable_rethrow` (the real one, not a mock) recognises those errors
    // by their digest; an ordinary Error, as in the case above, it leaves
    // alone.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const signal = Object.assign(new Error('Dynamic server usage: test'), {
      digest: 'DYNAMIC_SERVER_USAGE',
    })
    findGlobal.mockRejectedValue(signal)

    await expect(getCmsFooterLinksOrNone()).rejects.toBe(signal)
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('getCmsFooterLinksOrNone passes a successful read through', async () => {
    findGlobal.mockResolvedValue({
      links: [{ label: 'Privacy', href: '/privacy' }],
    })

    await expect(getCmsFooterLinksOrNone()).resolves.toEqual([
      { label: 'Privacy', href: '/privacy' },
    ])
  })

  it('reads at depth 0 and caches with the cmsContent profile', async () => {
    findGlobal.mockResolvedValue(null)

    await getCmsFooterLinks()

    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'footer', depth: 0 }),
    )
    expect(cacheLife).toHaveBeenCalledWith('cmsContent')
  })
})

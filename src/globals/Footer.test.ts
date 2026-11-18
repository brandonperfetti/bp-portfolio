import { beforeEach, describe, expect, it, vi } from 'vitest'

const { revalidateTag, revalidatePath } = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { Footer } from '@/globals/Footer'
import { CMS_TAGS } from '@/lib/cms/cache'

beforeEach(() => {
  revalidateTag.mockReset()
  revalidatePath.mockReset()
})

/**
 * #363: the footer global is read through a cached reader, so saving it has to
 * purge that reader's tag or an added link waits out the `cmsContent`
 * lifetime. The hook is run, not looked up by identity: `revalidateGlobal`
 * returns a new function per call, and what matters is the tag it purges.
 */
describe('Footer global', () => {
  it('purges the tag its reader caches under, with expire: 0, when saved', () => {
    const hooks = Footer.hooks?.afterChange
    // The container before its contents (docs/TESTING.md § Policy).
    expect(Array.isArray(hooks)).toBe(true)
    expect(hooks).toHaveLength(1)

    const doc = { links: [{ label: 'Privacy', href: '/privacy' }] }
    const result = hooks![0]!({
      doc,
      req: {
        context: {},
        payload: { logger: { info: vi.fn(), error: vi.fn() } },
      },
    } as never)

    expect(result).toBe(doc)
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith(CMS_TAGS.footer, { expire: 0 })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('stays readable by anyone and writable only when signed in', () => {
    expect(Footer.access?.read).toBe(anyone)
    expect(Footer.access?.update).toBe(authenticated)
  })

  it('keeps the links field shape the reader maps (no schema change in #363)', () => {
    const links = Footer.fields.find(
      (field) => 'name' in field && field.name === 'links',
    )
    expect(links).toMatchObject({
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true },
      ],
    })
  })
})

import { describe, expect, it, vi } from 'vitest'

// The route module is a thin Payload-scaffolded wrapper; stub what it imports
// so reading its `instant` export never boots Payload in jsdom.
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@payloadcms/next/views', () => ({
  RootPage: vi.fn(),
  generatePageMetadata: vi.fn(),
}))
vi.mock('../importMap', () => ({ importMap: {} }))

import { instant } from '@/app/(payload)/admin/[[...segments]]/page'

describe('/admin/[[...segments]] render mode (#216)', () => {
  it('is [block]: allowed to block, since the runtime reads live inside @payloadcms/next', () => {
    // Guards the one line we add to a file Payload may re-scaffold.
    expect(instant).toBe(false)
  })
})

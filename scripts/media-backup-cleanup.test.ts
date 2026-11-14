// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile as realWriteFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

/**
 * A failed temporary-file cleanup must not discard a copy already made (#328,
 * independent review at e17ce2b, R3). Its own file because it replaces `rm`
 * from `node:fs/promises` for the module under test.
 */
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rm: vi.fn(async () => {
      throw Object.assign(new Error('EACCES cleanup'), { code: 'EACCES' })
    }),
  }
})

const { backup } = await import('./media-backup')

describe('backup cleanup (#328)', () => {
  it('records a copy whose temporary file could not be removed as copied', async () => {
    const bytes = Buffer.from('A2-newest')
    const etag = createHash('md5').update(bytes).digest('hex')
    const puts: string[] = []
    const workDir = await mkdtemp(path.join(tmpdir(), 'media-backup-cleanup-'))
    const manifest = await backup({
      deps: {
        async downloadPublic(_url, dest) {
          await realWriteFile(dest, bytes)
          return {
            etag: `"${etag}"`,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size: bytes.byteLength,
          }
        },
        async headPublic() {
          return {
            contentType: 'image/png',
            etag: `"${etag}"`,
            lastModified: null,
            size: bytes.byteLength,
            status: 200,
          }
        },
        async r2Head() {
          return null
        },
        async r2PutCreateOnly(key) {
          puts.push(key)
          return 'created'
        },
      },
      now: new Date('2026-11-14T09:30:12.345Z'),
      origin: 'https://store.public.blob.vercel-storage.com',
      previous: null,
      references: [{ pathname: 'a.png', table: 'media' }],
      workDir,
    })
    expect(puts).toEqual(['objects/a.png'])
    expect(manifest.entries[0]).toMatchObject({
      key: 'objects/a.png',
      status: 'copied',
    })
  })
})

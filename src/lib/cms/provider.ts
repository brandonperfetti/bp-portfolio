import type { CmsProvider } from '@/lib/cms/types'

function normalizeProvider(value: string | undefined): CmsProvider {
  if (value?.trim().toLowerCase() === 'notion') {
    return 'notion'
  }

  return 'local'
}

export function getCmsProvider(): CmsProvider {
  return normalizeProvider(process.env.CMS_PROVIDER)
}

export function isNotionProvider(): boolean {
  return getCmsProvider() === 'notion'
}

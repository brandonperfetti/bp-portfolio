import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectGithubTechSignals } from './techSignals'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('collectGithubTechSignals', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.GITHUB_OWNER = 'brandonperfetti'
    process.env.GITHUB_TOKEN = 'test-token'
    process.env.GITHUB_TECH_REPO_LIMIT = '5'
    process.env.GITHUB_TECH_MAX_REPO_AGE_MONTHS = '24'
    process.env.GITHUB_TECH_INCLUDE_PRIVATE = 'false'
    process.env.GITHUB_TECH_MAX_PACKAGE_JSON_FILES_PER_REPO = '1'
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value
    }
    vi.unstubAllGlobals()
  })

  it('returns ok=false with a clear error when required env is missing', async () => {
    delete process.env.GITHUB_OWNER
    delete process.env.GITHUB_TECH_OWNER

    const result = await collectGithubTechSignals()
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('Missing GITHUB_OWNER')
  })

  it('returns ok=false when repo listing fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/users/brandonperfetti/repos')) {
          return new Response('unauthorized', { status: 401 })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const result = await collectGithubTechSignals()
    expect(result.ok).toBe(false)
    expect(result.signals).toHaveLength(0)
    expect(result.errors.join(' ')).toContain('401')
  })

  it('collects repo signals in a successful run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/users/brandonperfetti/repos')) {
          return jsonResponse([
            {
              name: 'bp-portfolio',
              full_name: 'brandonperfetti/bp-portfolio',
              private: false,
              archived: false,
              fork: false,
              language: 'TypeScript',
              topics: ['web'],
              pushed_at: new Date().toISOString(),
              default_branch: 'main',
              languages_url:
                'https://api.github.com/repos/brandonperfetti/bp-portfolio/languages',
            },
          ])
        }
        if (
          url ===
          'https://api.github.com/repos/brandonperfetti/bp-portfolio/languages'
        ) {
          return jsonResponse({ TypeScript: 1000, JavaScript: 250 })
        }
        if (
          url ===
          'https://api.github.com/repos/brandonperfetti/bp-portfolio/git/trees/main'
        ) {
          return jsonResponse({ tree: [] })
        }
        return jsonResponse([], 200)
      }),
    )

    const result = await collectGithubTechSignals()
    expect(result.ok).toBe(true)
    expect(result.scannedRepos).toBe(1)
    const keys = result.signals.map((signal) => signal.key)
    expect(keys).toContain('typescript')
    expect(result.errors).toEqual([])
  })
})

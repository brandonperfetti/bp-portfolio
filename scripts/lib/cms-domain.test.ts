// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BRIEF_PATH,
  OWNED_PATHS,
  buildHookResponse,
  isOwnedPath,
  readHookBrief,
} from './cms-domain.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const hookScript = path.join(repoRoot, '.claude/hooks/cms-domain-context.mjs')

/** Runs the real hook script the way Claude Code does: JSON on stdin. */
function runHook(stdin: string) {
  return spawnSync(process.execPath, [hookScript], {
    input: stdin,
    encoding: 'utf8',
  })
}

const editInput = (filePath: string, toolName = 'Edit') =>
  JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: toolName,
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
  })

describe('isOwnedPath', () => {
  it.each([
    'src/collections/Posts/index.ts',
    'src/globals/Footer.ts',
    'src/blocks/Banner/config.ts',
    'src/fields/slug/slugPaths.ts',
    'src/plugins/index.ts',
    'src/lib/cms/articlesRepo.ts',
    'src/migrations/20260101_000000_x.ts',
    'src/payload.config.ts',
  ])('owns %s, relative or absolute', (rel) => {
    expect(isOwnedPath(rel, repoRoot)).toBe(true)
    expect(isOwnedPath(path.join(repoRoot, rel), repoRoot)).toBe(true)
  })

  it.each([
    'src/components/ui/button.tsx',
    'src/lib/ai/corvus.ts',
    'src/payload-types.ts',
    'src/payload.config.ts.bak',
    'src/collectionsX/a.ts',
    'docs/PAYLOAD.md',
    '../other-worktree/src/collections/Posts/index.ts',
    '/tmp/src/collections/Posts/index.ts',
    '',
  ])('does not own %s', (p) => {
    expect(isOwnedPath(p, repoRoot)).toBe(false)
  })

  it('does not own a non-string path', () => {
    expect(isOwnedPath(undefined, repoRoot)).toBe(false)
    expect(isOwnedPath(42, repoRoot)).toBe(false)
  })
})

describe('the brief', () => {
  const brief = readFileSync(path.join(repoRoot, BRIEF_PATH), 'utf8')

  it('lists exactly the owned paths the hook matches', () => {
    const section = brief.split('## Owned paths')[1].split('\n## ')[0]
    const listed = [...section.matchAll(/^- `([^`]+)`$/gm)].map((m) => m[1])
    expect(listed).toEqual(OWNED_PATHS)
  })

  it('carries a non-empty hook brief between its markers', () => {
    const text = readHookBrief(repoRoot)
    expect(text).toContain('docs/agents/cms-domain.md')
    expect(text).not.toContain('<!--')
  })

  it('yields null when the brief is missing', () => {
    expect(readHookBrief('/nonexistent-repo-root')).toBeNull()
  })
})

describe('buildHookResponse', () => {
  it('adds the brief as context for an owned edit, and nothing else', () => {
    const res = buildHookResponse(
      JSON.parse(editInput('src/collections/Posts/index.ts')),
      repoRoot,
    )
    expect(res).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: readHookBrief(repoRoot),
      },
    })
  })

  it('returns null outside the owned paths and for odd input', () => {
    expect(
      buildHookResponse(JSON.parse(editInput('src/app/page.tsx')), repoRoot),
    ).toBeNull()
    expect(buildHookResponse({}, repoRoot)).toBeNull()
    expect(buildHookResponse(null, repoRoot)).toBeNull()
  })
})

describe('the hook script never blocks', () => {
  it('prints the context and exits 0 on an owned edit', () => {
    const r = runHook(
      editInput(path.join(repoRoot, 'src/collections/Posts/index.ts')),
    )
    expect(r.status).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.hookSpecificOutput.additionalContext).toBe(
      readHookBrief(repoRoot),
    )
    expect(JSON.stringify(out)).not.toMatch(
      /permissionDecision|"decision"|"continue"/,
    )
  })

  it.each([
    ['an unowned edit', editInput(path.join(repoRoot, 'src/app/page.tsx'))],
    ['malformed JSON', '{not json'],
    ['empty stdin', ''],
    ['no file_path', JSON.stringify({ tool_name: 'Write', tool_input: {} })],
  ])('prints nothing and exits 0 on %s', (_label, stdin) => {
    const r = runHook(stdin)
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('')
  })

  it('is wired for Edit and Write in .claude/settings.json, with no deny', () => {
    const settings = JSON.parse(
      readFileSync(path.join(repoRoot, '.claude/settings.json'), 'utf8'),
    )
    const [entry] = settings.hooks.PreToolUse
    expect(entry.matcher.split('|')).toEqual(
      expect.arrayContaining(['Edit', 'Write']),
    )
    expect(entry.hooks[0].command).toContain(
      '.claude/hooks/cms-domain-context.mjs',
    )
    expect(settings.permissions).toBeUndefined()
  })
})

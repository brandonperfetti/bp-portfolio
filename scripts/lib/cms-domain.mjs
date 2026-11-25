import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The CMS Domain Agent's owned paths, relative to the repo root (#383).
 *
 * @remarks `docs/agents/cms-domain.md` § Owned paths lists the same entries
 * for readers; `cms-domain.test.ts` fails when the two drift apart. A trailing
 * `/` marks a directory (prefix match); anything else is one exact file.
 */
export const OWNED_PATHS = [
  'src/collections/',
  'src/globals/',
  'src/blocks/',
  'src/fields/',
  'src/plugins/',
  'src/lib/cms/',
  'src/migrations/',
  'src/payload.config.ts',
]

/** Repo-relative path of the brief that carries the hook text. */
export const BRIEF_PATH = 'docs/agents/cms-domain.md'

const BRIEF_START = '<!-- cms-domain-hook-brief:start -->'
const BRIEF_END = '<!-- cms-domain-hook-brief:end -->'

/**
 * Whether `filePath` falls under one of the owned paths.
 *
 * @remarks A path outside `repoRoot` (another worktree, `~/.claude`, a
 * relative path that climbs out) is never owned, so the hook stays quiet for
 * edits that are not to this checkout's CMS. Separators are normalised so the
 * prefix match does not depend on the platform.
 *
 * @param filePath - Absolute path, or one relative to `repoRoot`.
 * @param repoRoot - Absolute path of the checkout.
 * @returns `true` when the edit is to an owned file.
 */
export function isOwnedPath(filePath, repoRoot) {
  if (typeof filePath !== 'string' || filePath === '') return false
  const rel = path
    .relative(repoRoot, path.resolve(repoRoot, filePath))
    .split(path.sep)
    .join('/')
  if (rel === '' || rel.startsWith('../') || path.isAbsolute(rel)) return false
  return OWNED_PATHS.some((owned) =>
    owned.endsWith('/') ? rel.startsWith(owned) : rel === owned,
  )
}

/**
 * Reads the hook text from the brief: everything between its two markers.
 *
 * @remarks The brief is the single home of this text, so the hook and the
 * plain-Markdown readers never see two versions of it.
 *
 * @param repoRoot - Absolute path of the checkout.
 * @returns The trimmed text, or `null` when the file or a marker is missing.
 */
export function readHookBrief(repoRoot) {
  let text
  try {
    text = readFileSync(path.join(repoRoot, BRIEF_PATH), 'utf8')
  } catch {
    return null
  }
  const start = text.indexOf(BRIEF_START)
  const end = text.indexOf(BRIEF_END)
  if (start === -1 || end === -1 || end < start) return null
  const brief = text.slice(start + BRIEF_START.length, end).trim()
  return brief === '' ? null : brief
}

/**
 * Builds the Claude Code `PreToolUse` hook response for one tool call.
 *
 * @remarks **It only ever adds context.** The response never carries a
 * `permissionDecision`, `decision` or `continue: false`, so it cannot deny,
 * ask about or stop a tool call; `null` means "print nothing", which the
 * harness reads as no opinion. Edits outside the owned paths, and any input
 * that is not a recognisable file edit, get `null`.
 *
 * @param input - The hook's parsed stdin (`tool_name`, `tool_input`, …).
 * @param repoRoot - Absolute path of the checkout.
 * @returns The JSON object to print, or `null`.
 */
export function buildHookResponse(input, repoRoot) {
  const filePath = input?.tool_input?.file_path
  if (!isOwnedPath(filePath, repoRoot)) return null
  const brief = readHookBrief(repoRoot)
  if (brief === null) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: brief,
    },
  }
}

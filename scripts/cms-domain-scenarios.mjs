#!/usr/bin/env node
/**
 * Runs the CMS Domain Agent's scenario checks under Claude Code (#383).
 *
 * Usage: `node scripts/cms-domain-scenarios.mjs [outDir]`
 *
 * Each scenario in `docs/agents/cms-domain-scenarios.md` is sent, without its
 * required finding, to `claude -p --agent cms-domain`. A scenario passes when
 * the answer names every one of its terms and the agent neither touched the
 * scenarios file nor called a tool outside Read, Grep and Glob. The full
 * transcript of each run is written to `outDir` (default: a temp directory),
 * with a `summary.json` that records the date, the Claude Code version and the
 * model that answered.
 *
 * @remarks **Why the scenarios file is denied.** It holds the answers. The
 * agent runs inside the repo with read access, so a run that read it would
 * prove nothing; the file is denied by a permission rule for the run, and a
 * transcript that mentions it in any tool call fails the scenario anyway.
 *
 * Not part of the CI gate: it spends model calls and needs a signed-in
 * Claude Code. It exits 1 when any scenario fails.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseScenarios } from './lib/cms-domain-scenarios.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const SCENARIOS = 'docs/agents/cms-domain-scenarios.md'
const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob'])

const outDir =
  process.argv[2] ?? mkdtempSync(path.join(os.tmpdir(), 'cms-domain-'))
mkdirSync(outDir, { recursive: true })

const scenarios = parseScenarios(
  readFileSync(path.join(repoRoot, SCENARIOS), 'utf8'),
)
const settings = JSON.stringify({
  permissions: { deny: [`Read(./${SCENARIOS})`] },
})
const version = spawnSync('claude', ['--version'], {
  encoding: 'utf8',
}).stdout.trim()

const results = []
for (const s of scenarios) {
  const prompt = `Review this proposed change to the repository for CMS hazards. Give your findings.\n\n${s.prompt}`
  const run = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--agent',
      'cms-domain',
      '--settings',
      settings,
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const events = run.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  writeFileSync(path.join(outDir, `scenario-${s.number}.jsonl`), run.stdout)

  const init = events.find((e) => e.type === 'system' && e.subtype === 'init')
  const final = events.findLast((e) => e.type === 'result')
  const toolCalls = events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((c) => c.type === 'tool_use')
  const answer = final?.result ?? ''
  const missing = s.terms.filter(
    (t) => !answer.toLowerCase().includes(t.toLowerCase()),
  )
  const offTools = toolCalls.filter((c) => !READ_ONLY_TOOLS.has(c.name))
  const touchedAnswers = toolCalls.some((c) =>
    JSON.stringify(c.input).includes('cms-domain-scenarios'),
  )
  const pass =
    run.status === 0 &&
    missing.length === 0 &&
    offTools.length === 0 &&
    !touchedAnswers
  results.push({
    scenario: s.number,
    title: s.title,
    pass,
    missingTerms: missing,
    offTools: offTools.map((c) => c.name),
    touchedAnswers,
    model: init?.model ?? null,
    tools: init?.tools ?? null,
    toolCalls: toolCalls.map((c) => ({ name: c.name, input: c.input })),
    answer,
  })
  console.log(
    `${pass ? 'PASS' : 'FAIL'} scenario ${s.number}: ${s.title}` +
      (missing.length ? ` (missing: ${missing.join(', ')})` : '') +
      (offTools.length ? ` (non-read tools: ${offTools.join(', ')})` : '') +
      (touchedAnswers ? ' (touched the scenarios file)' : ''),
  )
}

const summary = {
  date: new Date().toISOString(),
  claudeCode: version,
  results,
}
writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(summary, null, 2),
)
console.log(`transcripts and summary: ${outDir}`)
process.exit(results.every((r) => r.pass) ? 0 : 1)

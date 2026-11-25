#!/usr/bin/env node
/**
 * Runs the CMS Domain Agent's scenario checks under Claude Code (#383).
 *
 * Usage: `node scripts/cms-domain-scenarios.mjs [outDir]`
 *
 * Each scenario in `docs/agents/cms-domain-scenarios.md` is sent, without its
 * required finding, to `claude -p --agent cms-domain`. The transcript of each
 * run is written to `outDir` (default: a temp directory), with a
 * `summary.json` that records the date, the Claude Code version, the model
 * that answered and each full answer.
 *
 * @remarks **This script checks a floor, not the finding.** It fails a run
 * with no init or result event, a tool outside Read, Grep and Glob, any sign
 * of the answer key, or a missing term (`checkScenarioRun`). A run that clears
 * all of that is reported `TERMS PRESENT`, never `PASS`: an answer can name
 * every term while recommending the defect. A scenario passes only when a
 * reader has checked each answer in `summary.json` against its required
 * finding and recorded that in the PR.
 *
 * The scenarios file holds the answers, so it is also denied by a permission
 * rule for the run. Claude Code applies a Read deny to Grep and Glob on a
 * best-effort basis, which is why the transcript check exists as well.
 *
 * Not part of the CI gate: it spends model calls and needs a signed-in Claude
 * Code. It exits 1 when any run fails the floor.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkScenarioRun,
  parseScenarios,
} from './lib/cms-domain-scenarios.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const SCENARIOS = 'docs/agents/cms-domain-scenarios.md'

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
}).stdout?.trim()

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
  const stdout = run.stdout ?? ''
  writeFileSync(path.join(outDir, `scenario-${s.number}.jsonl`), stdout)
  const events = stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
  const check = checkScenarioRun(events, s, run.status)
  results.push({ scenario: s.number, title: s.title, ...check })
  console.log(
    `${check.status === 'terms-present' ? 'TERMS PRESENT' : 'FAIL'} scenario ${s.number}: ${s.title}` +
      (check.problems.length ? ` (${check.problems.join('; ')})` : ''),
  )
}

const summary = {
  date: new Date().toISOString(),
  claudeCode: version ?? null,
  semanticReview:
    'pending: read each answer against its required finding and record the verdict in the PR',
  results,
}
writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify(summary, null, 2),
)
console.log(`transcripts and summary: ${outDir}`)
console.log(
  'A scenario passes only once each answer is read against its required finding.',
)
process.exit(results.every((r) => r.status === 'terms-present') ? 0 : 1)

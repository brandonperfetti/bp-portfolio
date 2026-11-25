// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { checkScenarioRun, parseScenarios } from './cms-domain-scenarios.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const doc = readFileSync(
  path.join(repoRoot, 'docs/agents/cms-domain-scenarios.md'),
  'utf8',
)

describe('parseScenarios', () => {
  const scenarios = parseScenarios(doc)

  it('finds the three scenarios #383 requires, in order', () => {
    // Never lower this count to make a check pass: the scenarios file's rule.
    expect(scenarios.map((s) => s.number)).toEqual([1, 2, 3])
  })

  it('never hands the agent the required finding or its terms line', () => {
    for (const s of scenarios) {
      expect(s.prompt).not.toContain('Required finding')
      expect(s.prompt).not.toMatch(/^Terms:/m)
      expect(s.prompt.length).toBeGreaterThan(0)
    }
  })

  it('pins the terms each scenario is checked for', () => {
    expect(scenarios.map((s) => s.terms)).toEqual([
      ['migration', 'migrate:create', '_v'],
      ['limit: 0', 'pagination: false', 'cap'],
      ['expire: 0', '#118'],
    ])
  })

  it('refuses a scenario that could not fail', () => {
    expect(() =>
      parseScenarios('## Scenario 1: x\n\nbody\n\n**Required finding:** y\n'),
    ).toThrow(/no terms/)
    expect(() => parseScenarios('## Scenario 1: x\n\nbody only\n')).toThrow(
      /no finding/,
    )
  })

  it('refuses a document with no scenarios, so the runner cannot pass on none', () => {
    expect(() => parseScenarios('# Scenarios\n\nNothing here.\n')).toThrow(
      /No scenarios found/,
    )
  })
})

describe('checkScenarioRun', () => {
  const scenario = { terms: ['expire: 0', '#118'] }
  const init = {
    type: 'system',
    subtype: 'init',
    model: 'claude-haiku-5-5',
    tools: ['Read', 'Grep', 'Glob'],
  }
  const result = (text: string) => ({ type: 'result', result: text })
  const call = (name: string, input: object) => ({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, input }] },
  })
  const toolResult = (content: string) => ({
    type: 'user',
    message: { content: [{ type: 'tool_result', content }] },
  })

  it('never reports a semantic pass, even for a term-complete wrong answer', () => {
    // #383 review finding 2: this answer names both terms and recommends the
    // defect. The floor holds, so the status is terms-present, not a pass.
    const check = checkScenarioRun(
      [init, result("Reject expire: 0; #118 recommends 'max'.")],
      scenario,
      0,
    )
    expect(check.status).toBe('terms-present')
    expect(check.status).not.toBe('pass')
  })

  it('fails a run with no init or result event', () => {
    expect(
      checkScenarioRun([result('expire: 0 #118')], scenario, 0).problems,
    ).toContain('no init event')
    expect(checkScenarioRun([init], scenario, 0).problems).toContain(
      'no result event',
    )
  })

  it('fails a non-zero exit, a write tool, and a granted write tool', () => {
    const ok = result('expire: 0 #118')
    expect(checkScenarioRun([init, ok], scenario, 1).status).toBe('fail')
    expect(
      checkScenarioRun(
        [init, call('Edit', { file_path: 'x' }), ok],
        scenario,
        0,
      ).problems,
    ).toContain('called Edit')
    expect(
      checkScenarioRun([{ ...init, tools: ['Read', 'Write'] }, ok], scenario, 0)
        .problems,
    ).toContain('init grants Write')
  })

  it('fails a run that asked for or was shown the answer key', () => {
    const ok = result('expire: 0 #118')
    expect(
      checkScenarioRun(
        [
          init,
          call('Read', { file_path: 'docs/agents/cms-domain-scenarios.md' }),
          ok,
        ],
        scenario,
        0,
      ).problems,
    ).toContain('saw the answer key')
    // A broad Grep whose input never names the file, but whose result does.
    expect(
      checkScenarioRun(
        [
          init,
          call('Grep', { pattern: 'expire' }),
          toolResult('docs/x.md:82:**Required finding:** `revalidateTag`'),
          ok,
        ],
        scenario,
        0,
      ).problems,
    ).toContain('saw the answer key')
  })

  it('does not flag the brief, which names the scenarios file', () => {
    const brief = readFileSync(
      path.join(repoRoot, 'docs/agents/cms-domain.md'),
      'utf8',
    )
    const check = checkScenarioRun(
      [
        init,
        call('Read', { file_path: 'docs/agents/cms-domain.md' }),
        toolResult(brief),
        result('expire: 0 #118'),
      ],
      scenario,
      0,
    )
    expect(check.status).toBe('terms-present')
  })
})

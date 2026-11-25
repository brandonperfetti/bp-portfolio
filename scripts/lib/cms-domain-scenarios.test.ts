// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { parseScenarios } from './cms-domain-scenarios.mjs'

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
})

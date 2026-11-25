/**
 * One scenario check from `docs/agents/cms-domain-scenarios.md`.
 *
 * @typedef {object} Scenario
 * @property {number} number - The scenario's number in its heading.
 * @property {string} title - The heading text after "Scenario N:".
 * @property {string} prompt - The PR description and diff, without the
 *   required finding.
 * @property {string[]} terms - The terms the answer must name.
 */

/** Tools the read-only agent may call; anything else fails the run. */
export const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob'])

/**
 * The answers file's name: a tool call that names it went looking for the
 * answers. Checked in tool-call input only, because the brief the agent reads
 * on every run names the file too.
 */
const ANSWER_KEY_FILE = 'cms-domain-scenarios'

/**
 * Text that only the answers file holds; seeing it in a tool result means the
 * agent read the answers, whatever the call that returned it asked for.
 */
const ANSWER_KEY_TEXT = ['**Required finding:**', 'Terms: `']

/**
 * The machine-checkable part of one scenario run.
 *
 * @typedef {object} RunCheck
 * @property {'terms-present' | 'fail'} status - `terms-present` means only
 *   that the mechanical floor held; it is never a semantic pass.
 * @property {string[]} problems - Why the run failed, empty when it did not.
 * @property {string[]} missingTerms - Terms the answer does not name.
 * @property {string | null} model - The model the init event reports.
 * @property {string[] | null} tools - The tools the init event reports.
 * @property {{ name: string, input: unknown }[]} toolCalls - Every tool call.
 * @property {string} answer - The final answer text.
 */

/**
 * Checks one scenario run's stream-json events against the mechanical floor.
 *
 * @remarks **A term check is not a review** (#383 review, finding 2). An
 * answer can name every term while recommending the defect ("no migration is
 * needed"), so the best status this returns is `terms-present`, and the
 * scenario is accepted only when a reader has checked the answer against its
 * required finding and recorded that in the PR. What this does fail, without a
 * reader: a run with no init or result event, a non-zero exit, a tool outside
 * Read/Grep/Glob, an init that grants one, and any sign of the answer key in a
 * tool call's input or a tool result's content.
 *
 * @param {unknown[]} events - Parsed stream-json lines.
 * @param {{ terms: string[] }} scenario - The scenario's terms.
 * @param {number | null} exitCode - The `claude` process's exit status.
 * @returns {RunCheck} The check.
 */
export function checkScenarioRun(events, scenario, exitCode) {
  const list = Array.isArray(events) ? events.filter(Boolean) : []
  const init = list.find((e) => e.type === 'system' && e.subtype === 'init')
  const final = list.findLast((e) => e.type === 'result')
  const contents = (type) =>
    list
      .filter((e) => e.type === type)
      .flatMap((e) =>
        Array.isArray(e.message?.content) ? e.message.content : [],
      )
  const toolCalls = contents('assistant').filter((c) => c.type === 'tool_use')
  const toolResults = contents('user').filter((c) => c.type === 'tool_result')
  const answer = typeof final?.result === 'string' ? final.result : ''

  const problems = []
  if (exitCode !== 0) problems.push(`claude exited ${exitCode}`)
  if (!init) problems.push('no init event')
  if (!final) problems.push('no result event')
  const grantedTools = Array.isArray(init?.tools) ? init.tools : null
  if (init && grantedTools === null) problems.push('init lists no tools')
  for (const t of grantedTools ?? []) {
    if (!READ_ONLY_TOOLS.has(t)) problems.push(`init grants ${t}`)
  }
  for (const c of toolCalls) {
    if (!READ_ONLY_TOOLS.has(c.name)) problems.push(`called ${c.name}`)
  }
  const askedForKey = toolCalls.some((c) =>
    JSON.stringify(c.input ?? '').includes(ANSWER_KEY_FILE),
  )
  const sawKey = toolResults.some((c) => {
    const text =
      typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
    return ANSWER_KEY_TEXT.some((m) => (text ?? '').includes(m))
  })
  if (askedForKey || sawKey) problems.push('saw the answer key')
  const missingTerms = scenario.terms.filter(
    (t) => !answer.toLowerCase().includes(t.toLowerCase()),
  )
  if (missingTerms.length) problems.push(`missing ${missingTerms.join(', ')}`)

  return {
    status: problems.length === 0 ? 'terms-present' : 'fail',
    problems,
    missingTerms,
    model: init?.model ?? null,
    tools: grantedTools,
    toolCalls: toolCalls.map((c) => ({ name: c.name, input: c.input })),
    answer,
  }
}

/**
 * Splits the scenarios document into the parts the runner needs.
 *
 * @remarks The prompt stops at `**Required finding:**`, so the agent is never
 * handed the answer. A scenario with no required finding or no terms throws:
 * a check that cannot fail would pass silently, which is the one outcome the
 * file's "never deleted to make a check pass" rule exists to prevent.
 *
 * @param {string} markdown - The scenarios document.
 * @returns {Scenario[]} The scenarios, in document order.
 */
export function parseScenarios(markdown) {
  const parts = markdown.split(/^## Scenario /m).slice(1)
  return parts.map((part) => {
    const heading = part.slice(0, part.indexOf('\n'))
    const match = /^(\d+):\s*(.+)$/.exec(heading.trim())
    if (!match) throw new Error(`Unparseable scenario heading: ${heading}`)
    const body = part.slice(part.indexOf('\n') + 1)
    const cut = body.indexOf('**Required finding:**')
    if (cut === -1) throw new Error(`Scenario ${match[1]} has no finding`)
    const termsLine = /^Terms:(.*)$/m.exec(body.slice(cut))
    const terms = termsLine
      ? [...termsLine[1].matchAll(/`([^`]+)`/g)].map((m) => m[1])
      : []
    if (terms.length === 0) throw new Error(`Scenario ${match[1]} has no terms`)
    return {
      number: Number(match[1]),
      title: match[2],
      prompt: body.slice(0, cut).trim(),
      terms,
    }
  })
}

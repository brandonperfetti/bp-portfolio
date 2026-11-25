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

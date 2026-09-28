// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint, RuleTester } from 'eslint'
import { beforeAll, describe, expect, it } from 'vitest'

import safeHtml, { GATE_RULE_ID } from './eslint-safe-html.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)

RuleTester.describe = describe
RuleTester.it = it

const options = [
  { sanitizers: [{ name: 'toSafeJsonLd', from: ['@/lib/seo/jsonLd'] }] },
]
const imp = "import { toSafeJsonLd } from '@/lib/seo/jsonLd'\n"

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
})

ruleTester.run('no-unsanitized-html', safeHtml.rules['no-unsanitized-html'], {
  valid: [
    // The shape 20 of the 21 existing call sites use.
    {
      code: `${imp}const a = <script dangerouslySetInnerHTML={{ __html: toSafeJsonLd(schema) }} />`,
      options,
    },
    // articles/page.tsx: the call hoisted into a const behind a ternary.
    {
      code: `${imp}const p = s ? toSafeJsonLd(s) : null\nconst a = <script dangerouslySetInnerHTML={{ __html: p }} />`,
      options,
    },
    // String-literal key, and a createElement props object.
    {
      code: `${imp}const a = <div dangerouslySetInnerHTML={{ '__html': toSafeJsonLd(x) }} />`,
      options,
    },
    {
      code: `${imp}createElement('script', { dangerouslySetInnerHTML: { __html: toSafeJsonLd(x) } })`,
      options,
    },
    // Reading the prop in a destructuring pattern is not a sink.
    {
      code: `function Foo({ dangerouslySetInnerHTML, ...rest }) { return rest }\nconst { dangerouslySetInnerHTML: d = null } = props`,
      options,
    },
  ],
  invalid: [
    // The deliberately unsafe case #248 names.
    {
      code: `const a = <script dangerouslySetInnerHTML={{ __html: someString }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    {
      code: `const a = <div dangerouslySetInnerHTML={{ __html: '<b>' + name + '</b>' }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    // A look-alike: right name, not the approved import.
    {
      code: `const toSafeJsonLd = (v) => v\nconst a = <script dangerouslySetInnerHTML={{ __html: toSafeJsonLd(x) }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    {
      code: `import { toSafeJsonLd } from './somewhere-else'\nconst a = <script dangerouslySetInnerHTML={{ __html: toSafeJsonLd(x) }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    {
      code: `import { other as toSafeJsonLd } from '@/lib/seo/jsonLd'\nconst a = <script dangerouslySetInnerHTML={{ __html: toSafeJsonLd(x) }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    // A reassignable binding proves nothing about the value at render time.
    {
      code: `${imp}let p = toSafeJsonLd(x)\np = raw\nconst a = <script dangerouslySetInnerHTML={{ __html: p }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    // One unsafe branch is enough.
    {
      code: `${imp}const a = <script dangerouslySetInnerHTML={{ __html: ok ? toSafeJsonLd(x) : raw }} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    // Opaque values cannot be checked.
    {
      code: `const a = <div dangerouslySetInnerHTML={props} />`,
      options,
      errors: [
        {
          message:
            '`dangerouslySetInnerHTML` must be an inline object literal whose `__html` comes from `toSafeJsonLd`, so its value can be checked.',
        },
      ],
    },
    {
      code: `${imp}const a = <div dangerouslySetInnerHTML={{ ...rest, __html: toSafeJsonLd(x) }} />`,
      options,
      errors: [{ messageId: 'notLiteral' }],
    },
    // A duplicate key renders the LAST value: the safe first one proves nothing.
    {
      code: `${imp}const a = <div dangerouslySetInnerHTML={{ __html: toSafeJsonLd(x), __html: raw }} />`,
      options,
      errors: [{ messageId: 'duplicateHtml' }, { messageId: 'unsanitized' }],
    },
    // Even two safe values: the duplicate itself is reported.
    {
      code: `${imp}createElement('div', { dangerouslySetInnerHTML: { __html: toSafeJsonLd(a), __html: toSafeJsonLd(b) } })`,
      options,
      errors: [{ messageId: 'duplicateHtml' }],
    },
    {
      code: `const a = <div dangerouslySetInnerHTML={{}} />`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
    {
      code: `createElement('div', { dangerouslySetInnerHTML: { __html: raw } })`,
      options,
      errors: [{ messageId: 'unsanitized' }],
    },
  ],
})

describe('the rule as the repo configures it (eslint.config.mjs)', () => {
  let eslint: ESLint
  beforeAll(() => {
    eslint = new ESLint({ cwd: repoRoot })
  })

  /** Lint a fixture as if it lived under src/ and return its rule ids. */
  const lint = async (code: string) => {
    const [result] = await eslint.lintText(code, {
      filePath: path.join(repoRoot, 'src/__lint-fixture__/Fixture.tsx'),
    })
    return result.messages.map((m) => m.ruleId)
  }

  const unsafe = [
    'export function Fixture({ someString }: { someString: string }) {',
    '  return <div dangerouslySetInnerHTML={{ __html: someString }} />',
    '}',
    '',
  ]

  it('fails a deliberately unsafe __html', async () => {
    expect(await lint(unsafe.join('\n'))).toEqual([GATE_RULE_ID])
  })

  it('passes the approved helper', async () => {
    const code = [
      "import { toSafeJsonLd } from '@/lib/seo/jsonLd'",
      '',
      'export function Fixture({ schema }: { schema: object }) {',
      '  return (',
      '    <script',
      '      type="application/ld+json"',
      '      dangerouslySetInnerHTML={{ __html: toSafeJsonLd(schema) }}',
      '    />',
      '  )',
      '}',
      '',
    ].join('\n')
    expect(await lint(code)).toEqual([])
  })

  it('accepts a disable directive only with a written reason', async () => {
    const withDirective = (directive: string) =>
      [unsafe[0], `  // ${directive}`, ...unsafe.slice(1)].join('\n')

    expect(
      await lint(
        withDirective(
          `eslint-disable-next-line ${GATE_RULE_ID} -- markup is a build-time constant`,
        ),
      ),
    ).toEqual([])
    expect(
      await lint(withDirective(`eslint-disable-next-line ${GATE_RULE_ID}`)),
    ).toEqual(['local/no-unjustified-html-disable'])
    // A blanket directive silences the gate too, so it needs a reason too.
    expect(await lint(withDirective('eslint-disable-next-line'))).toEqual([
      'local/no-unjustified-html-disable',
    ])
  })

  it('leaves directives alone in files with no dangerouslySetInnerHTML', async () => {
    const code = [
      '// eslint-disable-next-line prefer-const',
      'let unchanged = 1',
      'export { unchanged }',
      '',
    ].join('\n')
    expect(await lint(code)).toEqual([])
  })

  it('passes every existing call site in src/ unchanged', async () => {
    const sites = (
      readdirSync(path.join(repoRoot, 'src'), {
        recursive: true,
      }) as string[]
    )
      .filter((file) => /\.(tsx?|jsx?)$/.test(file))
      .map((file) => path.join(repoRoot, 'src', file))
      .filter((file) =>
        readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'),
      )
    // Positive control: the tree has sites for this to be a claim at all.
    expect(sites.length).toBeGreaterThan(0)

    const results = await eslint.lintFiles(sites)
    const local = results.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId?.startsWith('local/'))
        .map((m) => `${path.relative(repoRoot, r.filePath)}:${m.line}`),
    )
    expect(local).toEqual([])
  })
}, 60_000)

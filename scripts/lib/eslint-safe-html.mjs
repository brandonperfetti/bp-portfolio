/**
 * Local ESLint plugin that gates the JSON-LD escaping rule (#248): every
 * `dangerouslySetInnerHTML` must take its `__html` from an approved sanitizer
 * — `toSafeJsonLd` from `@/lib/seo/jsonLd` today — so a component that writes
 * raw HTML fails `pnpm lint` instead of shipping green.
 *
 * Why a local rule rather than `no-restricted-syntax`: a selector can match
 * the shape `__html: toSafeJsonLd(...)` but cannot follow a binding, and one
 * compliant call site already hoists the call into a `const`
 * (`src/app/(frontend)/articles/page.tsx`, `scriptPayload`). Following a
 * single-assignment `const` is a few lines of scope lookup. Why not
 * `eslint-plugin-no-unsanitized`: it adds a dependency for one rule this
 * small (#248 records the decision).
 *
 * Two rules, registered in `eslint.config.mjs` under the `local` prefix:
 *
 * - `local/no-unsanitized-html` — the gate itself.
 * - `local/no-unjustified-html-disable` — the escape hatch. Silencing the gate
 *   needs a directive with a written reason after ` -- `. It is a separate
 *   rule because a directive suppresses the rules it names: the gate cannot
 *   report the very comment that switches it off.
 *
 * Tested in `eslint-safe-html.test.ts` with `RuleTester` and against the
 * repo's own config.
 *
 * @module
 */

/** The gate's rule id as configured, which disable directives name. */
export const GATE_RULE_ID = 'local/no-unsanitized-html'

/** How many `const` hops the provenance check follows before giving up. */
const MAX_HOPS = 5

/**
 * Find the variable a name resolves to from a scope, walking outward.
 *
 * @param scope - The scope the name is used in.
 * @param name - The identifier's name.
 * @returns The variable, or `null` when it is an unresolved global.
 */
function resolveVariable(scope, name) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set.get(name)
    if (variable) return variable
  }
  return null
}

/**
 * Whether a callee is one of the configured sanitizers, imported under its own
 * name from its own module — so neither a local look-alike nor
 * `import { other as toSafeJsonLd }` passes.
 *
 * @param callee - The call's callee node.
 * @param scope - The scope the call is in.
 * @param sanitizers - `{ name, from }` pairs from the rule options.
 * @returns `true` for an approved sanitizer.
 */
function isSanitizer(callee, scope, sanitizers) {
  if (callee.type !== 'Identifier') return false
  const approved = sanitizers.find((s) => s.name === callee.name)
  if (!approved) return false
  const variable = resolveVariable(scope, callee.name)
  const def = variable?.defs.length === 1 ? variable.defs[0] : null
  return (
    def?.type === 'ImportBinding' &&
    def.node.type === 'ImportSpecifier' &&
    (def.node.imported.name ?? def.node.imported.value) === approved.name &&
    approved.from.includes(def.parent.source.value)
  )
}

/**
 * Whether an expression is known to produce sanitized markup (or nothing).
 *
 * @param node - The `__html` value, or an expression it came from.
 * @param context - The rule context.
 * @param sanitizers - `{ name, from }` pairs from the rule options.
 * @param hops - `const` hops followed so far.
 * @returns `true` when every path yields a sanitizer call or `null`.
 */
function isSafe(node, context, sanitizers, hops = 0) {
  const scope = context.sourceCode.getScope(node)
  switch (node.type) {
    case 'CallExpression':
      return isSanitizer(node.callee, scope, sanitizers)
    case 'Literal':
      return node.value === null && !node.regex
    case 'ConditionalExpression':
      return (
        isSafe(node.consequent, context, sanitizers, hops) &&
        isSafe(node.alternate, context, sanitizers, hops)
      )
    case 'Identifier': {
      if (hops >= MAX_HOPS) return false
      const variable = resolveVariable(scope, node.name)
      const def = variable?.defs.length === 1 ? variable.defs[0] : null
      if (
        def?.type !== 'Variable' ||
        def.parent.kind !== 'const' ||
        def.node.id.type !== 'Identifier' ||
        !def.node.init
      ) {
        return false
      }
      return isSafe(def.node.init, context, sanitizers, hops + 1)
    }
    default:
      return false
  }
}

/**
 * The name of a property key, for identifier and string-literal keys.
 *
 * @param property - An object-expression property.
 * @returns The key name, or `null` for a computed or other key.
 */
function keyName(property) {
  if (property.computed) return null
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'Literal') return String(property.key.value)
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
const noUnsanitizedHtml = {
  meta: {
    type: 'problem',
    docs: {
      description:
        // Static metadata, read without the rule's options, so it names the
        // option rather than a helper; the messages interpolate the helpers.
        'Require dangerouslySetInnerHTML.__html to come from a sanitizer configured in the `sanitizers` option.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          sanitizers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                from: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'from'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unsanitized:
        '`__html` must be produced by {{names}} (or a `const` holding its result). Raw strings here are an XSS sink — see #248. If this truly cannot use a sanitizer, disable this rule with a reason after ` -- `.',
      duplicateHtml:
        'Duplicate `__html` key: the last one wins, so an earlier sanitized value can be silently overridden. Keep exactly one.',
      notLiteral:
        '`dangerouslySetInnerHTML` must be an inline object literal whose `__html` comes from {{names}}, so its value can be checked.',
    },
  },
  create(context) {
    const sanitizers = context.options[0]?.sanitizers ?? []
    const names = sanitizers.map((s) => `\`${s.name}\``).join(' or ')

    /** Check the value given to `dangerouslySetInnerHTML`. */
    const check = (value, reportNode) => {
      if (value?.type !== 'ObjectExpression') {
        context.report({
          node: reportNode,
          messageId: 'notLiteral',
          data: { names },
        })
        return
      }
      if (value.properties.some((p) => p.type === 'SpreadElement')) {
        context.report({
          node: reportNode,
          messageId: 'notLiteral',
          data: { names },
        })
        return
      }
      // Every `__html`, not just the first: with a duplicate key the LAST one
      // renders, and in .js/.jsx nothing else flags the duplicate.
      const htmls = value.properties.filter((p) => keyName(p) === '__html')
      if (htmls.length === 0) {
        context.report({
          node: reportNode,
          messageId: 'unsanitized',
          data: { names },
        })
        return
      }
      htmls.forEach((html, index) => {
        if (index > 0) {
          context.report({ node: html, messageId: 'duplicateHtml' })
        }
        if (!isSafe(html.value, context, sanitizers)) {
          context.report({
            node: html,
            messageId: 'unsanitized',
            data: { names },
          })
        }
      })
    }

    return {
      JSXAttribute(node) {
        if (node.name.name !== 'dangerouslySetInnerHTML') return
        const value =
          node.value?.type === 'JSXExpressionContainer'
            ? node.value.expression
            : node.value
        check(value, node)
      },
      // `createElement('script', { dangerouslySetInnerHTML: ... })`.
      Property(node) {
        // `function Foo({ dangerouslySetInnerHTML, ...rest })` reads the prop
        // (a destructuring pattern), it does not pass one to a sink.
        if (node.parent.type === 'ObjectPattern') return
        if (keyName(node) !== 'dangerouslySetInnerHTML') return
        check(node.value, node)
      },
    }
  },
}

/** Matches an ESLint disable directive and captures its rule list. */
const DIRECTIVE = /^\s*eslint-disable(?:-next-line|-line)?(?=\s|$)([^]*)$/

/** @type {import('eslint').Rule.RuleModule} */
const noUnjustifiedHtmlDisable = {
  meta: {
    type: 'problem',
    docs: {
      description: `Require a written reason on any directive that silences ${GATE_RULE_ID}.`,
    },
    schema: [],
    messages: {
      unjustified: `A directive that silences ${GATE_RULE_ID} needs a reason after \` -- \`, e.g. \`// eslint-disable-next-line ${GATE_RULE_ID} -- <why this HTML is safe>\`.`,
    },
  },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context
        // Only files that have a sink need the check: a blanket disable in
        // a file with no dangerouslySetInnerHTML silences nothing here.
        if (!sourceCode.text.includes('dangerouslySetInnerHTML')) return
        for (const comment of sourceCode.getAllComments()) {
          const match = DIRECTIVE.exec(comment.value)
          if (!match) continue
          const [rulesPart, ...reason] = match[1].split(/\s-{2,}\s/u)
          const rules = rulesPart
            .split(',')
            .map((rule) => rule.trim())
            .filter(Boolean)
          const coversGate = rules.length === 0 || rules.includes(GATE_RULE_ID)
          if (coversGate && reason.join(' -- ').trim() === '') {
            context.report({ loc: comment.loc, messageId: 'unjustified' })
          }
        }
      },
    }
  },
}

/** The plugin object `eslint.config.mjs` registers as `local`. */
const plugin = {
  meta: { name: 'local-safe-html' },
  rules: {
    'no-unsanitized-html': noUnsanitizedHtml,
    'no-unjustified-html-disable': noUnjustifiedHtmlDisable,
  },
}

export default plugin

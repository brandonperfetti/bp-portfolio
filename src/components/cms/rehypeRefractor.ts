import { refractor } from '@/components/cms/refractorLanguages'

/** The slice of a hast node this plugin reads; hast itself is not a direct dependency. */
type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

const classList = (node: HastNode): string[] => {
  const className = node.properties?.className
  return Array.isArray(className) ? className.map(String) : []
}

/** The text content of a node: every descendant text value, in order. */
const textOf = (node: HastNode): string =>
  node.type === 'text'
    ? (node.value ?? '')
    : (node.children ?? []).map(textOf).join('')

const visit = (node: HastNode, parent: HastNode | null) => {
  if (
    parent?.tagName === 'pre' &&
    node.type === 'element' &&
    node.tagName === 'code'
  ) {
    highlight(node, parent)
  }
  for (const child of node.children ?? []) visit(child, node)
}

const highlight = (code: HastNode, pre: HastNode) => {
  const language = classList(code)
    .find((name) => name.startsWith('language-'))
    ?.slice('language-'.length)
    .toLowerCase()
  if (language === undefined) return

  // The `pre` takes the class even for a language that is not registered,
  // as @mapbox/rehype-prism did: the Prism theme keys its block styles on it.
  pre.properties = {
    ...pre.properties,
    className: [...classList(pre), `language-${language}`],
  }
  if (!refractor.registered(language)) return
  code.children = refractor.highlight(textOf(code), language)
    .children as HastNode[]
}

/**
 * Rehype plugin that highlights `pre > code.language-*` with refractor 5,
 * using refractor 3.6.0's grammar set and registration order.
 *
 * @remarks It replaces `@mapbox/rehype-prism` (#350), which is stuck on
 * refractor 3 and so on `prismjs` below 1.30 (GHSA-x7hr-w5r2-h6wg).
 * refractor ≥4.7 bundles its own grammars with no `prismjs` dependency. The output is kept
 * the same as that plugin's: the same token spans (`refractorLanguages`
 * explains the order), and an unregistered language left unhighlighted
 * instead of throwing, because migrated articles carry values such as `none`
 * and a throw 500s the article.
 */
export function rehypeRefractor() {
  return (tree: HastNode) => {
    visit(tree, null)
  }
}

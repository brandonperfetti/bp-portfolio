/**
 * Guards against storing a Lexical value whose root has zero children.
 *
 * Lexical refuses to load such a value: `setEditorState` throws error #38
 * ("the editor state is empty. Ensure the editor state's root node never
 * becomes empty"), which the Payload admin surfaces as "Something went wrong:
 * Minified Lexical error #38" in place of the editor. The field is then
 * uneditable — the only fix is a DB write. A cleared rich-text field must
 * therefore be stored as `NULL` (which Payload and every reader already
 * tolerate), never as an empty root.
 *
 * @see #164 — `pages.hero_rich_text` for the `about` page held
 *   `{"root":{"type":"root",...,"children":[]}}` and broke its hero tab.
 */

/** A Lexical value shaped enough to inspect its root children. */
type MaybeLexicalRoot = {
  root?: { children?: unknown } | null
}

/**
 * True when `value` is a Lexical editor value whose root carries no children.
 *
 * Deliberately narrow: only the exact shape Lexical chokes on returns true.
 * `null`, `undefined`, primitives, objects without a `root`, a `root` that is
 * not an object, a missing or non-array `children`, and any root with at least
 * one child all return false — a normaliser built on this must never turn real
 * content, or an already-null field, into something else.
 *
 * @param value - A stored rich-text field value, of unknown shape.
 * @returns Whether the value is an empty-root Lexical state.
 */
export function isEmptyLexicalRoot(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const root = (value as MaybeLexicalRoot).root
  if (typeof root !== 'object' || root === null) {
    return false
  }
  const children = root.children
  return Array.isArray(children) && children.length === 0
}

/**
 * `null` when `value` is an empty Lexical root, otherwise `value` unchanged.
 *
 * The write-side half of the guard: apply it wherever a rich-text value is
 * about to be persisted, so a cleared field lands as `NULL` rather than as the
 * empty root that makes the admin editor unopenable (#164).
 *
 * @param value - A stored rich-text field value, of unknown shape.
 * @returns `null` for an empty root; the identical reference otherwise.
 */
export function nullIfEmptyLexicalRoot<T>(value: T): T | null {
  return isEmptyLexicalRoot(value) ? null : value
}

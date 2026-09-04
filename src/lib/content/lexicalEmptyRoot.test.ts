import { describe, expect, it } from 'vitest'

import { isEmptyLexicalRoot, nullIfEmptyLexicalRoot } from './lexicalEmptyRoot'

/** The exact value #164 found stored in `pages.hero_rich_text` for `about`. */
const storedEmptyRoot = {
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    children: [],
    direction: 'ltr',
  },
}

const oneParagraph = {
  root: {
    type: 'root',
    children: [{ type: 'paragraph', version: 1, children: [] }],
  },
}

describe('isEmptyLexicalRoot', () => {
  it('is true for the empty root Lexical refuses to load (#38)', () => {
    expect(isEmptyLexicalRoot(storedEmptyRoot)).toBe(true)
    expect(isEmptyLexicalRoot({ root: { children: [] } })).toBe(true)
  })

  it('is false for a root with at least one child', () => {
    // Even a paragraph holding no text is real editor state Lexical loads
    // fine; only the childless root is the broken case.
    expect(isEmptyLexicalRoot(oneParagraph)).toBe(false)
  })

  it('is false for nullish and non-object values', () => {
    expect(isEmptyLexicalRoot(null)).toBe(false)
    expect(isEmptyLexicalRoot(undefined)).toBe(false)
    expect(isEmptyLexicalRoot('')).toBe(false)
    expect(isEmptyLexicalRoot(0)).toBe(false)
    expect(isEmptyLexicalRoot(false)).toBe(false)
    expect(isEmptyLexicalRoot([])).toBe(false)
  })

  it('is false for objects that are not a Lexical value', () => {
    expect(isEmptyLexicalRoot({})).toBe(false)
    expect(isEmptyLexicalRoot({ root: null })).toBe(false)
    expect(isEmptyLexicalRoot({ root: 'root' })).toBe(false)
    expect(isEmptyLexicalRoot({ root: {} })).toBe(false)
    expect(isEmptyLexicalRoot({ root: { children: null } })).toBe(false)
    // A non-array `children` is not "zero children" — it is a shape we do not
    // recognise, and guessing would risk nulling something real.
    expect(isEmptyLexicalRoot({ root: { children: {} } })).toBe(false)
  })
})

describe('nullIfEmptyLexicalRoot', () => {
  it('maps an empty root to null', () => {
    expect(nullIfEmptyLexicalRoot(storedEmptyRoot)).toBeNull()
  })

  it('passes real content through by reference', () => {
    expect(nullIfEmptyLexicalRoot(oneParagraph)).toBe(oneParagraph)
  })

  it('leaves nullish values exactly as they were', () => {
    expect(nullIfEmptyLexicalRoot(null)).toBeNull()
    expect(nullIfEmptyLexicalRoot(undefined)).toBeUndefined()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeSnippet } from '@/components/cms/CodeSnippet'

const tokens = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('code .token')).map((node) => [
    node.className,
    node.textContent,
  ])

describe('CodeSnippet', () => {
  it('highlights known languages', () => {
    const { container } = render(
      <CodeSnippet language="typescript" code="const x = 1" />,
    )
    expect(screen.getByText(/const/)).toBeInTheDocument()
    expect(container.querySelector('pre')).toHaveClass('language-typescript')
    expect(tokens(container)).toEqual([
      ['token keyword', 'const'],
      ['token operator', '='],
      ['token number', '1'],
    ])
  })

  // The spans below are what @mapbox/rehype-prism (refractor 3.6.0) rendered;
  // the Prism theme styles exactly these classes (#350).
  it('keeps the js-extras tokens on TypeScript', () => {
    const { container } = render(
      <CodeSnippet
        language="typescript"
        code={"import { Post } from './types'"}
      />,
    )
    expect(tokens(container)).toEqual(
      expect.arrayContaining([
        ['token keyword module', 'import'],
        ['token maybe-class-name', 'Post'],
        ['token keyword module', 'from'],
      ]),
    )
  })

  it('leaves a JavaScript regex literal untokenised inside', () => {
    const { container } = render(
      <CodeSnippet language="javascript" code="const re = /^a+$/g" />,
    )
    expect(
      container.querySelector('.regex-source')?.querySelector('.token'),
    ).toBeNull()
  })

  it('renders bash flags as plain text, not a parameter token', () => {
    const { container } = render(
      <CodeSnippet language="bash" code="set -euo pipefail" />,
    )
    expect(tokens(container)).toEqual([['token builtin class-name', 'set']])
  })

  it('leaves names refractor 3.6.0 did not register unhighlighted', () => {
    const { container } = render(
      <CodeSnippet language="sh" code={'echo "$HOME"'} />,
    )
    expect(container.querySelector('pre')).toHaveClass('language-sh')
    expect(tokens(container)).toEqual([])
  })

  it('renders plain-text fences (language "none") without throwing', () => {
    // Regression: migrated articles carry language "none"; the prism
    // highlighter throws "Unknown language" for unregistered names, which
    // 500'd /articles/docker-for-frontend-devs on staging.
    const { container } = render(
      <CodeSnippet language="none" code="node_modules\n.next\n.git" />,
    )
    expect(screen.getByText(/node_modules/)).toBeInTheDocument()
    expect(tokens(container)).toEqual([])
  })

  it('survives arbitrary unregistered languages', () => {
    const { container } = render(
      <CodeSnippet language="not-a-real-lang" code="hello world" />,
    )
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
    expect(container.querySelector('pre')).toHaveClass(
      'language-not-a-real-lang',
    )
    expect(tokens(container)).toEqual([])
  })
})

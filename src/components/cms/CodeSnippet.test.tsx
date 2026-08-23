import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CodeSnippet } from '@/components/cms/CodeSnippet'

describe('CodeSnippet', () => {
  it('highlights known languages', () => {
    render(<CodeSnippet language="typescript" code="const x = 1" />)
    expect(screen.getByText(/const/)).toBeInTheDocument()
  })

  it('renders plain-text fences (language "none") without throwing', () => {
    // Regression: migrated articles carry language "none"; the prism
    // highlighter throws "Unknown language" for unregistered names, which
    // 500'd /articles/docker-for-frontend-devs on staging.
    render(<CodeSnippet language="none" code="node_modules\n.next\n.git" />)
    expect(screen.getByText(/node_modules/)).toBeInTheDocument()
  })

  it('survives arbitrary unregistered languages', () => {
    render(<CodeSnippet language="not-a-real-lang" code="hello world" />)
    expect(screen.getByText(/hello world/)).toBeInTheDocument()
  })
})

import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useMounted } from '@/lib/useMounted'

afterEach(() => {
  cleanup()
})

function Probe() {
  const mounted = useMounted()
  return <span data-testid="probe">{mounted ? 'mounted' : 'pending'}</span>
}

describe('useMounted', () => {
  it('is false on the server render', () => {
    // The half a jsdom `render()` cannot show: what SSR emits.
    expect(renderToString(<Probe />)).toContain('pending')
  })

  it('is true once the component has committed in the browser', () => {
    render(<Probe />)
    // RTL's render flushes effects, so this is the post-hydration state.
    expect(screen.getByTestId('probe')).toHaveTextContent('mounted')
  })

  it('matches the server output on the HYDRATION render, then flips', async () => {
    // The whole contract in one test: if the hook returned true during
    // hydration, React would report a recoverable mismatch here.
    const html = renderToString(
      <div>
        <Probe />
      </div>,
    )
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const recoverable: string[] = []
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(
        container,
        <div>
          <Probe />
        </div>,
        { onRecoverableError: (error) => recoverable.push(String(error)) },
      )
    })

    expect(recoverable).toEqual([])
    // …and the browser-only branch is live once the commit has landed.
    expect(container.textContent).toContain('mounted')

    await act(async () => {
      root?.unmount()
    })
    container.remove()
  })
})

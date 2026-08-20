import { render } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  LIGHT_MODE_SHADER_PRESET,
  SHADER_HERO_FRAME_CLASS,
  SHADER_HERO_PANEL_CLASS,
  ShaderHero,
  activeShaderPreset,
} from '@/components/heros/ShaderHero'

// The canvas arrives through next/dynamic and never SSRs; jsdom has neither
// WebGPU nor WebGL2, so only the static-gradient fallback renders here.
vi.mock('next/dynamic', () => ({ default: () => () => null }))

// jsdom ships no matchMedia; the reduced-motion hook calls it on mount.
// Defined on `window` rather than through `vi.stubGlobal` so the
// `unstubAllGlobals` in the IntersectionObserver test can't strip it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  // jsdom has no canvas backend either; answer the WebGL2 probe with a plain
  // "no GPU" instead of letting jsdom log "Not implemented" per render.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => null,
  })
})

const frame = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]') as HTMLElement

describe('ShaderHero default framing', () => {
  // The homepage renders `<ShaderHero />` with no props and must keep
  // rendering exactly what it rendered before the component was
  // parameterised for the CMS hero (#31).
  it('keeps the homepage geometry when called without props', () => {
    const { container } = render(<ShaderHero />)

    expect(frame(container)).toHaveAttribute('class', SHADER_HERO_FRAME_CLASS)
    expect(frame(container).firstElementChild).toHaveAttribute(
      'class',
      SHADER_HERO_PANEL_CLASS,
    )
  })

  it('paints the static gradient, the scrim and the bottom fade by default', () => {
    const { container } = render(<ShaderHero />)

    expect(container.querySelector('.bg-gradient-to-br')).not.toBeNull()
    expect(container.querySelector('.bg-gradient-to-r')).not.toBeNull()
    expect(container.querySelector('.h-24')).not.toBeNull()
  })
})

describe('ShaderHero overrides', () => {
  it('takes a caller-supplied frame and panel box', () => {
    const { container } = render(
      <ShaderHero
        className="absolute inset-0"
        panelClassName="h-full w-full"
      />,
    )

    expect(frame(container)).toHaveAttribute('class', 'absolute inset-0')
    expect(frame(container).firstElementChild).toHaveAttribute(
      'class',
      'h-full w-full',
    )
  })

  it('drops the scrim and fade on request, keeping the gradient', () => {
    const { container } = render(
      <ShaderHero scrim={false} bottomFade={false} />,
    )

    expect(container.querySelector('.bg-gradient-to-br')).not.toBeNull()
    expect(container.querySelector('.bg-gradient-to-r')).toBeNull()
    expect(container.querySelector('.h-24')).toBeNull()
  })
})

describe('ShaderHero GPU pause', () => {
  it('observes its own frame and disconnects on unmount', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect = disconnect
        unobserve = vi.fn()
        takeRecords = vi.fn()
      },
    )

    const { container, unmount } = render(<ShaderHero />)
    expect(observe).toHaveBeenCalledWith(frame(container))

    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})

describe('activeShaderPreset', () => {
  it('swaps to the light preset in light mode', () => {
    expect(activeShaderPreset('northern-lights-2', 'light')).toBe(
      LIGHT_MODE_SHADER_PRESET,
    )
    expect(LIGHT_MODE_SHADER_PRESET).toBe('static-noise-4')
  })

  it('keeps the configured preset in dark mode and before the theme resolves', () => {
    expect(activeShaderPreset('synthesis-14', 'dark')).toBe('synthesis-14')
    expect(activeShaderPreset('synthesis-14', undefined)).toBe('synthesis-14')
  })
})

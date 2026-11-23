import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SLOW_MESSAGE, useAuthSteps } from './useAuthSteps'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

/** A step the test settles by hand. */
function held<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const restoreFromBackForwardCache = () =>
  window.dispatchEvent(
    Object.assign(new Event('pageshow'), { persisted: true }),
  )

/**
 * The lock both auth forms put around a Clerk request (#377, #379): one
 * request at a time, and only the request that holds the lock releases it.
 */
describe('useAuthSteps', () => {
  it('refuses a second step while one is in flight', async () => {
    const { result } = renderHook(() => useAuthSteps({ logTag: 'test' }))
    const first = held<void>()
    const second = vi.fn(async () => {})

    let running!: Promise<void>
    act(() => {
      running = result.current.run(() => first.promise)
    })
    expect(result.current.busy).toBe(true)
    await act(() => result.current.run(second))
    expect(second).not.toHaveBeenCalled()

    await act(async () => {
      first.resolve()
      await running
    })
    expect(result.current.busy).toBe(false)
  })

  it('a request that settles after a Back-button restore does not unlock a newer one', async () => {
    const { result } = renderHook(() => useAuthSteps({ logTag: 'test' }))
    const old = held<void>()
    const newer = held<void>()

    let oldRun!: Promise<void>
    act(() => {
      oldRun = result.current.run(() => old.promise)
    })
    // The browser restores the page: the form unlocks for another choice.
    act(() => restoreFromBackForwardCache())
    expect(result.current.busy).toBe(false)

    let newerRun!: Promise<void>
    act(() => {
      newerRun = result.current.run(() => newer.promise)
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      old.resolve()
      await oldRun
    })
    // Still the newer request's lock.
    expect(result.current.busy).toBe(true)

    await act(async () => {
      newer.resolve()
      await newerRun
    })
    expect(result.current.busy).toBe(false)
  })

  it('a step that leaves the page stays locked, then unlocks with the slow message', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() =>
        useAuthSteps({ logTag: 'test', leaveTimeoutMs: 1000 }),
      )
      await act(() => result.current.run(async () => ({ stayLocked: true })))
      expect(result.current.busy).toBe(true)
      act(() => vi.advanceTimersByTime(1000))
      expect(result.current.busy).toBe(false)
      expect(result.current.localErrors).toEqual([SLOW_MESSAGE])
    } finally {
      vi.useRealTimers()
    }
  })
})

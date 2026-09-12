import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDeadline, withDeadline } from '@/lib/ai/withDeadline'

/**
 * The bound the Corvus hooks promise, tested as a bound rather than as a
 * constant (#165 rider 1).
 *
 * @remarks `AbortSignal.timeout` is driven by an internal timer no fake-timer
 * library patches, which is why `createDeadline` is an `AbortController` plus
 * a cancellable `setTimeout` — a budget a test can advance is a budget a test
 * can assert.
 */

afterEach(() => {
  vi.useRealTimers()
})

describe('createDeadline', () => {
  it('aborts its signal once the budget is spent', async () => {
    vi.useFakeTimers()
    const deadline = createDeadline(1_000)

    expect(deadline.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(999)
    expect(deadline.signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(deadline.signal.aborted).toBe(true)
  })

  it('done() cancels the timer, so nothing outlives the operation', async () => {
    // The one thing `AbortSignal.timeout` gave for free: no pending timer
    // holding a serverless function alive after the work is done.
    vi.useFakeTimers()
    const deadline = createDeadline(1_000)

    deadline.done()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(deadline.signal.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('withDeadline', () => {
  it('passes a result straight through', async () => {
    const deadline = createDeadline(1_000)
    await expect(
      withDeadline(Promise.resolve('ok'), deadline.signal),
    ).resolves.toBe('ok')
    deadline.done()
  })

  it('passes a rejection straight through', async () => {
    const deadline = createDeadline(1_000)
    await expect(
      withDeadline(Promise.reject(new Error('boom')), deadline.signal),
    ).rejects.toThrow('boom')
    deadline.done()
  })

  it('rejects work the signal cannot reach, once the budget is spent', async () => {
    // The whole point: `payload.find` and the drizzle statements take no
    // AbortSignal, so without this a slow database stalls a content save for
    // as long as it likes.
    vi.useFakeTimers()
    const deadline = createDeadline(1_000)
    const pending = withDeadline(new Promise(() => {}), deadline.signal)
    const caught = pending.catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(String(await caught)).toContain('deadline of 1000ms exceeded')
  })

  it('rejects immediately when handed an already-spent signal', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already gone'))

    await expect(
      withDeadline(new Promise(() => {}), controller.signal),
    ).rejects.toThrow('already gone')
  })

  it('is a pass-through with no signal — the backfill must not give up on a clock', async () => {
    // A repair tool should fail loudly and be re-run, not abandon work on a
    // timer. `refreshTechStackSummary` passes `args.abortSignal`, which the
    // backfill leaves undefined.
    await expect(withDeadline(Promise.resolve(7))).resolves.toBe(7)
  })

  it('removes its abort listener when the work settles first', async () => {
    // Otherwise every bounded call leaks a listener onto a signal that may
    // outlive it.
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')

    await withDeadline(Promise.resolve('done'), controller.signal)

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

import { describe, expect, it } from 'vitest'

import { getCorvusGreeting, getCorvusGreetingBucket } from './greeting'

describe('getCorvusGreetingBucket', () => {
  it('buckets the morning window (5–11)', () => {
    expect(getCorvusGreetingBucket(5)).toBe('morning')
    expect(getCorvusGreetingBucket(9)).toBe('morning')
    expect(getCorvusGreetingBucket(11)).toBe('morning')
  })

  it('buckets the afternoon window (12–16)', () => {
    expect(getCorvusGreetingBucket(12)).toBe('afternoon')
    expect(getCorvusGreetingBucket(16)).toBe('afternoon')
  })

  it('buckets the evening window (17–21)', () => {
    expect(getCorvusGreetingBucket(17)).toBe('evening')
    expect(getCorvusGreetingBucket(21)).toBe('evening')
  })

  it('buckets everything else as late-night, including the midnight wrap', () => {
    expect(getCorvusGreetingBucket(22)).toBe('late-night')
    expect(getCorvusGreetingBucket(23)).toBe('late-night')
    expect(getCorvusGreetingBucket(0)).toBe('late-night')
    expect(getCorvusGreetingBucket(4)).toBe('late-night')
  })
})

describe('getCorvusGreeting', () => {
  it('reads as a plain statement with no name for morning/afternoon/evening', () => {
    expect(getCorvusGreeting(9)).toBe('Morning.')
    expect(getCorvusGreeting(14)).toBe('Afternoon.')
    expect(getCorvusGreeting(19)).toBe('Evening.')
  })

  it('appends the Clerk first name for morning/afternoon/evening', () => {
    expect(getCorvusGreeting(9, 'Brandon')).toBe('Morning, Brandon.')
    expect(getCorvusGreeting(14, 'Brandon')).toBe('Afternoon, Brandon.')
    expect(getCorvusGreeting(19, 'Brandon')).toBe('Evening, Brandon.')
  })

  it('reads as a question for the late-night bucket, with and without a name', () => {
    expect(getCorvusGreeting(23)).toBe('Late one?')
    expect(getCorvusGreeting(23, 'Brandon')).toBe('Late one, Brandon?')
    expect(getCorvusGreeting(2)).toBe('Late one?')
  })

  it('treats a null or undefined first name as anonymous (no name in the line)', () => {
    expect(getCorvusGreeting(9, null)).toBe('Morning.')
    expect(getCorvusGreeting(9, undefined)).toBe('Morning.')
  })

  it('treats an empty-string first name as anonymous (guards a signed-in user with no name on file)', () => {
    expect(getCorvusGreeting(9, '')).toBe('Morning.')
  })
})

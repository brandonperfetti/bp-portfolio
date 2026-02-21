import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    if (delayMs <= 0) {
      setDebouncedValue(value)
      return
    }

    const timer = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}

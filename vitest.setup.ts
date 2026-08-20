import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// RTL auto-cleanup needs vitest globals (off here) — register it manually,
// or each render accumulates in the shared jsdom document and multi-render
// suites start failing with "found multiple elements".
afterEach(() => {
  cleanup()
})

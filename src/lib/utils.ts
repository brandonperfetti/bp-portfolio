import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge conditional class names with Tailwind-aware conflict resolution.
 *
 * @param inputs - Class values (strings, arrays, conditionals) to merge.
 * @returns A single className string with later Tailwind utilities winning.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

/**
 * Simple object check.
 * @param item - Value to test.
 * @returns `true` for a non-array object, `false` otherwise.
 */
export function isObject(item: unknown): item is object {
  return typeof item === 'object' && !Array.isArray(item)
}

/**
 * Deep merge two objects.
 * @param target - Base object; copied, never mutated.
 * @param source - Object whose values win, merged recursively into `target`.
 */
export default function deepMerge<T, R>(target: T, source: R): T {
  const output = { ...target }
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }

  return output
}

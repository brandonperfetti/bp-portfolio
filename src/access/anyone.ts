import type { Access } from 'payload'

/**
 * Access control that allows anyone, including anonymous visitors.
 *
 * @remarks Use for content that is publicly readable (e.g. published media).
 */
export const anyone: Access = () => true

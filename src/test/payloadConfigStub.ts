/**
 * Vitest stand-in for the `@payload-config` alias. Unit tests that import
 * route handlers (which import the real Payload config for `getPayload`)
 * would otherwise drag the entire CMS + DB adapter into jsdom. Tests mock
 * `payload`'s `getPayload` themselves; this stub only satisfies module
 * resolution.
 */
export default {} as never

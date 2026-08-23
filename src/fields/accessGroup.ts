import type { Field } from 'payload'

/**
 * Access-control group carried by gateable content (Posts, later others).
 *
 * @remarks `visibility: gated` requires a signed-in (Clerk) user; enforcement
 * happens server-side via {@link canAccess}. `requiredPlan`/`requiredFeature`
 * are the dormant Clerk Billing seam — unused until billing flips on.
 */
export const accessGroup: Field = {
  name: 'access',
  type: 'group',
  admin: {
    position: 'sidebar',
  },
  fields: [
    {
      name: 'visibility',
      type: 'select',
      defaultValue: 'public',
      options: [
        { label: 'Public', value: 'public' },
        { label: 'Gated (sign-in required)', value: 'gated' },
      ],
      required: true,
    },
    {
      name: 'requiredPlan',
      type: 'text',
      admin: {
        description:
          'Clerk Billing plan slug (dormant until billing is enabled).',
      },
    },
    {
      name: 'requiredFeature',
      type: 'text',
      admin: {
        description: 'Clerk feature flag (dormant until billing is enabled).',
      },
    },
  ],
}

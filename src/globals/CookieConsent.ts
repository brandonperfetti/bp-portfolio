import type { GlobalConfig } from 'payload'

import { anyone } from '@/access/anyone'
import { authenticated } from '@/access/authenticated'
import { DEFAULT_CONSENT_CONFIG } from '@/components/consent/consent-content'
import { revalidateGlobal } from '@/hooks/revalidateGlobal'

const D = DEFAULT_CONSENT_CONFIG
const cat = (key: 'essential' | 'analytics' | 'social' | 'advertising') =>
  D.categories.find((c) => c.key === key)!

/**
 * CMS-driven cookie-consent copy, categories, and feature toggles for the
 * headless c15t banner/dialog (#83 follow-up).
 *
 * @remarks
 * Mirrors the Strapi cookie-consent field set, adapted to bp's real buttons
 * (Accept all / Reject non-essential / Customize / Save / cookie details) and
 * its title-less banner. Field `defaultValue`s reproduce today's hardcoded copy
 * so a freshly-seeded global matches the current UX; the reader
 * (`getCmsConsentConfig`) additionally falls back to the same literals when the
 * global is empty/unseeded, keeping the site behavior-preserving.
 *
 * Categories: Essential is forced-on/non-editable; Analytics defaults on;
 * **Social and Advertising default OFF** — their plumbing is present but no
 * scripts are wired, so enabling them only records the consent category. Only
 * enabled categories are offered to c15t and rendered in the dialog.
 *
 * Some fields are **parity/reserved** (marked in their admin descriptions):
 * they exist to mirror the Strapi set and are editable, but bp does not render
 * them yet — `disableAutomaticBlocking` (no c15t auto-blocking to toggle in the
 * headless offline setup), the modal status/declined/consented/cancel strings,
 * and the always-on label. They are intentionally not consumed by the reader.
 */
export const CookieConsent: GlobalConfig = {
  slug: 'cookie-consent',
  access: {
    read: anyone,
    update: authenticated,
  },
  admin: {
    description:
      'Cookie-consent banner/dialog copy, categories, and toggles. Empty fields fall back to the built-in defaults (today’s copy).',
  },
  fields: [
    {
      name: 'banner',
      type: 'group',
      admin: { description: 'Consent banner copy and button labels.' },
      fields: [
        {
          name: 'title',
          type: 'text',
          admin: {
            description:
              'Optional heading above the banner message. Empty → no heading (bp’s default).',
          },
        },
        {
          name: 'message',
          type: 'textarea',
          required: true,
          defaultValue: D.banner.message,
        },
        {
          name: 'cookieDetailsLabel',
          type: 'text',
          defaultValue: D.banner.cookieDetailsLabel,
          admin: { description: 'Inline “cookie details” trigger label.' },
        },
        {
          name: 'acceptAllLabel',
          type: 'text',
          defaultValue: D.banner.acceptAllLabel,
        },
        {
          name: 'rejectNonEssentialLabel',
          type: 'text',
          defaultValue: D.banner.rejectNonEssentialLabel,
        },
        {
          name: 'customizeLabel',
          type: 'text',
          defaultValue: D.banner.customizeLabel,
        },
        {
          name: 'privacyPolicyText',
          type: 'text',
          admin: {
            description:
              'Optional privacy-policy link text (shown in the dialog when a page is set). Empty → no link.',
          },
        },
        {
          name: 'privacyPolicyPage',
          type: 'relationship',
          relationTo: 'pages',
          admin: {
            description:
              'Optional page the privacy-policy link points to. Resolved to /{slug}.',
          },
        },
      ],
    },
    {
      name: 'dialog',
      type: 'group',
      admin: { description: 'Manage-cookies dialog copy and button labels.' },
      fields: [
        { name: 'title', type: 'text', defaultValue: D.dialog.title },
        {
          name: 'description',
          type: 'textarea',
          defaultValue: D.dialog.description,
        },
        {
          name: 'rejectLabel',
          type: 'text',
          defaultValue: D.dialog.rejectLabel,
        },
        { name: 'saveLabel', type: 'text', defaultValue: D.dialog.saveLabel },
        {
          name: 'acceptAllLabel',
          type: 'text',
          defaultValue: D.dialog.acceptAllLabel,
        },
        {
          type: 'collapsible',
          label: 'Reserved (not yet rendered)',
          admin: { initCollapsed: true },
          fields: [
            {
              name: 'statusTextTemplate',
              type: 'text',
              defaultValue: 'Status: {{status}} on {{date}}',
              admin: {
                description:
                  'Parity/reserved — not rendered by bp’s dialog today.',
              },
            },
            {
              name: 'declinedText',
              type: 'text',
              defaultValue: 'Declined',
              admin: { description: 'Parity/reserved — not rendered today.' },
            },
            {
              name: 'consentedText',
              type: 'text',
              defaultValue: 'Consented',
              admin: { description: 'Parity/reserved — not rendered today.' },
            },
            {
              name: 'cancelButtonLabel',
              type: 'text',
              defaultValue: 'Cancel',
              admin: {
                description:
                  'Parity/reserved — bp’s dialog closes via Escape/overlay, no Cancel button today.',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'features',
      type: 'group',
      admin: { description: 'Feature toggles (mirrors the Strapi reference).' },
      fields: [
        {
          name: 'disableAutomaticBlocking',
          type: 'checkbox',
          defaultValue: D.features.disableAutomaticBlocking,
          admin: {
            description:
              'Parity/reserved NO-OP: bp’s headless offline c15t has no automatic script blocking to disable (GA4 is gated via the scripts config). Kept for parity; does not change behavior today.',
          },
        },
        {
          name: 'showManageButton',
          type: 'checkbox',
          defaultValue: D.features.showManageButton,
          admin: {
            description: 'Show the banner’s “Customize” button.',
          },
        },
        {
          name: 'showPersistentCookieButton',
          type: 'checkbox',
          defaultValue: D.features.showPersistentCookieButton,
          admin: {
            description: 'Show the persistent footer “Manage cookies” button.',
          },
        },
      ],
    },
    {
      name: 'categories',
      type: 'group',
      admin: {
        description:
          'Consent categories. Essential is always on; Analytics defaults on; Social and Advertising default OFF (plumbing only, no scripts wired).',
      },
      fields: [
        {
          name: 'alwaysOnLabel',
          type: 'text',
          defaultValue: 'Always on',
          admin: {
            description: 'Parity/reserved — not rendered as a label today.',
          },
        },
        {
          name: 'essential',
          type: 'group',
          admin: {
            description: 'Strictly necessary — forced on, non-editable.',
          },
          fields: [
            {
              name: 'title',
              type: 'text',
              defaultValue: cat('essential').title,
            },
            {
              name: 'subtitle',
              type: 'textarea',
              defaultValue: cat('essential').subtitle,
            },
          ],
        },
        {
          name: 'analytics',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: cat('analytics').enabled,
              admin: { description: 'Offer the Analytics category.' },
            },
            {
              name: 'title',
              type: 'text',
              defaultValue: cat('analytics').title,
            },
            {
              name: 'subtitle',
              type: 'textarea',
              defaultValue: cat('analytics').subtitle,
            },
          ],
        },
        {
          name: 'social',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: cat('social').enabled,
              admin: {
                description:
                  'Offer the Social category (consent-record-only; no scripts wired).',
              },
            },
            { name: 'title', type: 'text', defaultValue: cat('social').title },
            {
              name: 'subtitle',
              type: 'textarea',
              defaultValue: cat('social').subtitle,
            },
          ],
        },
        {
          name: 'advertising',
          type: 'group',
          fields: [
            {
              name: 'enabled',
              type: 'checkbox',
              defaultValue: cat('advertising').enabled,
              admin: {
                description:
                  'Offer the Advertising category (consent-record-only; no pixels wired).',
              },
            },
            {
              name: 'title',
              type: 'text',
              defaultValue: cat('advertising').title,
            },
            {
              name: 'subtitle',
              type: 'textarea',
              defaultValue: cat('advertising').subtitle,
            },
          ],
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal('cookie-consent')],
  },
}

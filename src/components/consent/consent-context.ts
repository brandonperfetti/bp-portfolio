'use client'

import { createContext, useContext } from 'react'

import { type ConsentConfig, DEFAULT_CONSENT_CONFIG } from './consent-content'

/**
 * The resolved, CMS-driven consent copy/category/feature config, provided by
 * {@link ConsentManager} and consumed by the banner, dialog, and persistent
 * "Manage cookies" link.
 *
 * @remarks
 * Defaults to {@link DEFAULT_CONSENT_CONFIG} so a component rendered without the
 * provider (isolated stories/tests) still gets today's copy verbatim — the
 * whole surface is behavior-preserving with an empty CMS.
 */
const ConsentConfigContext = createContext<ConsentConfig>(
  DEFAULT_CONSENT_CONFIG,
)

/** Provider for the resolved {@link ConsentConfig}. */
export const ConsentConfigProvider = ConsentConfigContext.Provider

/** Reads the resolved {@link ConsentConfig} (falls back to today's defaults). */
export function useConsentConfig(): ConsentConfig {
  return useContext(ConsentConfigContext)
}

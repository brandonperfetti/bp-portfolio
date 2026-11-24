/**
 * The social connections the custom sign-in and sign-up forms offer (#431).
 *
 * @remarks
 * Clerk's hooks expose no instance settings, so the forms cannot ask Clerk
 * which connections are on. Google has been on in every instance since the
 * forms were built (#377, #379). GitHub is offered only where
 * `CLERK_GITHUB_ENABLED` is `true`: a GitHub button on an instance whose
 * GitHub connection is off would only show Clerk's refusal, and production
 * needs a registered GitHub application before it can be switched on
 * (`docs/AUTH.md`, "GitHub").
 *
 * The flag is read on the server, at request time (both auth pages render per
 * request), so turning it on or off takes a redeploy of the environment
 * variable only, never a rebuild for a `NEXT_PUBLIC_` value.
 */

/** A social connection the forms can offer, in display order. */
export type SocialProvider = 'google' | 'github'

/** What each connection is called on the button and in messages, and Clerk's strategy for it. */
export const SOCIAL_PROVIDERS = {
  google: { label: 'Google', strategy: 'oauth_google' },
  github: { label: 'GitHub', strategy: 'oauth_github' },
} as const satisfies Record<SocialProvider, { label: string; strategy: string }>

/** What the forms offer when nothing says otherwise: Google only, as before #431. */
export const DEFAULT_SOCIAL_PROVIDERS: readonly SocialProvider[] = ['google']

/**
 * The connections this deployment offers, in display order.
 *
 * @param env - The environment to read; a seam for tests.
 * @returns Google, then GitHub when `CLERK_GITHUB_ENABLED` is exactly `true`.
 */
export function enabledSocialProviders(
  env: Record<string, string | undefined> = process.env,
): readonly SocialProvider[] {
  return env.CLERK_GITHUB_ENABLED === 'true'
    ? ['google', 'github']
    : DEFAULT_SOCIAL_PROVIDERS
}

/**
 * The connection a Clerk strategy names, if it is one the forms know.
 *
 * @param strategy - A verification's strategy (`oauth_google`, …), or none.
 */
export function socialProviderOf(
  strategy: string | null | undefined,
): SocialProvider | undefined {
  return (Object.keys(SOCIAL_PROVIDERS) as SocialProvider[]).find(
    (provider) => SOCIAL_PROVIDERS[provider].strategy === strategy,
  )
}

/**
 * The connections' names joined for a sentence: "Google", "Google or GitHub".
 *
 * @param providers - The connections on offer, at least one.
 */
export function socialProviderNames(
  providers: readonly SocialProvider[],
): string {
  const labels = providers.map((provider) => SOCIAL_PROVIDERS[provider].label)
  if (labels.length <= 1) return labels.join('')
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

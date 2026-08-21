import type { PayloadRequest } from 'payload'
import { getPayload } from 'payload'

import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

import configPromise from '@payload-config'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

export type PreviewSearchParams = {
  path: string
  previewSecret: string
}

export async function GET(req: NextRequest): Promise<Response> {
  const payload = await getPayload({ config: configPromise })

  const { searchParams } = new URL(req.url)

  const path = searchParams.get('path')
  const previewSecret = searchParams.get('previewSecret')

  if (!isValidSecret(previewSecret, process.env.PREVIEW_SECRET)) {
    // Loud diagnosis for the silent-403 class found live 2026-08-10: when
    // PREVIEW_SECRET is missing from the deployment's environment (e.g. an
    // env var not scoped to the custom "staging" environment — the exact
    // failure CMS_REVALIDATE_SECRET had), the admin bakes an empty secret
    // into the preview URL and every preview 403s with no signal in the
    // runtime logs. Same class as the Corvus source-guard incident:
    // env-coupled behavior that no local test or CI run can catch.
    if (!process.env.PREVIEW_SECRET) {
      payload.logger.error(
        'PREVIEW_SECRET is not set in this environment — all draft previews will 403. Check the env var scoping for this Vercel environment.',
      )
    }
    return new Response('You are not allowed to preview this page', {
      status: 403,
    })
  }

  if (!path) {
    return new Response('Insufficient search params', { status: 404 })
  }

  if (!path.startsWith('/')) {
    return new Response(
      'This endpoint can only be used for relative previews',
      { status: 500 },
    )
  }

  let user

  try {
    // Destructure the auth RESULT — payload.auth() returns
    // { user, permissions }, which is truthy even for anonymous requests.
    // Assigning the whole object made the `!user` guard below dead code
    // (found while diagnosing the preview 403s, 2026-08-10); the secret
    // gate above masked it, but the auth check must hold on its own.
    ;({ user } = await payload.auth({
      req: req as unknown as PayloadRequest,
      headers: req.headers,
    }))
  } catch (error) {
    payload.logger.error(
      { err: error },
      'Error verifying token for live preview',
    )
    return new Response('You are not allowed to preview this page', {
      status: 403,
    })
  }

  const draft = await draftMode()

  if (!user) {
    draft.disable()
    return new Response('You are not allowed to preview this page', {
      status: 403,
    })
  }

  // You can add additional checks here to see if the user is allowed to preview this page

  draft.enable()

  redirect(path)
}

/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import type { Metadata } from 'next'

import config from '@payload-config'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

/**
 * [block] (#216) — the one line we add to this Payload-scaffolded file.
 *
 * @remarks Both of this route's blocking-prerender errors come from inside
 * `@payloadcms/next` 3.88.0, not from this wrapper, which only forwards the
 * `params` / `searchParams` promises unawaited. `RootPage` awaits them and then
 * reads `headers()` and the database (`views/Root/index.js:37,47,102,164`,
 * `utilities/initReq.js:20`); `generatePageMetadata` awaits `params` and reads
 * `cookies()` / `headers()` through `getNextRequestI18n`
 * (`views/Root/metadata.js:32,47`, `utilities/getNextRequestI18n.js:17-18`).
 * There is nothing here to wrap in `<Suspense>`, and an authenticated admin
 * gains nothing from a prerendered shell, so the route is declared allowed to
 * block. This only exempts it from Cache Components' dev-time validation; the
 * production render is unchanged (`next/dist/docs` `instant.md`). If Payload
 * ever re-scaffolds this file, `page.test.ts` beside it fails until the line
 * is restored.
 */
export const instant = false

export const generateMetadata = ({
  params,
  searchParams,
}: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

const Page = ({ params, searchParams }: Args) =>
  RootPage({ config, params, searchParams, importMap })

export default Page

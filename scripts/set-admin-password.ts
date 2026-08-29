/**
 * One-off admin password reset (Payload has no email adapter yet, so the
 * "Forgot password?" flow only logs to the server console).
 *
 * Usage (against whatever DATABASE_URL/.env points at):
 *
 * ```sh
 * ADMIN_EMAIL=<email> ADMIN_PASSWORD='new-password' \
 *   pnpm payload run scripts/set-admin-password.ts
 * ```
 */
import config from '@payload-config'
import { getPayload } from 'payload'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD

if (!email || !password) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required.')
  process.exit(1)
}

const payload = await getPayload({ config })
const { docs } = await payload.find({
  collection: 'users',
  where: { email: { equals: email } },
  limit: 1,
})

if (!docs[0]) {
  const created = await payload.create({
    collection: 'users',
    data: { email, password, name: email.split('@')[0] },
  })
  console.log(`[reset] no user found — created admin ${created.email}`)
} else {
  await payload.update({
    collection: 'users',
    id: docs[0].id,
    data: { password },
  })
  console.log(`[reset] password updated for ${email}`)
}
process.exit(0)

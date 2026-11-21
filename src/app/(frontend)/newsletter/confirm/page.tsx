import { type Metadata } from 'next'

import { SimpleLayout } from '@/components/SimpleLayout'
import { ConfirmSubscription } from '@/components/newsletter/ConfirmSubscription'

export const metadata: Metadata = {
  title: 'Confirm your subscription',
  description: 'Confirm that you want an email when I publish something new.',
  robots: { index: false, follow: false },
}

/**
 * Where a Newsletter Signup confirmation link lands (#407, double opt-in).
 *
 * @remarks Static and token-free on the server: the button reads `?token=`
 * in the browser and posts it to `/api/newsletter/confirm`. Opening the page
 * changes nothing, so a mail scanner that opens the link subscribes no one.
 * Kept out of search (`noindex`); the URL is only ever in a confirmation
 * email.
 */
export default function NewsletterConfirmPage() {
  return (
    <SimpleLayout
      title="Confirm your subscription"
      intro="Press Confirm and I'll email you when I publish something new. If you didn't ask for this, close this page and nothing happens."
    >
      <ConfirmSubscription />
    </SimpleLayout>
  )
}

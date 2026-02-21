import { NextResponse } from 'next/server'
import sgMail from '@sendgrid/mail'

export async function POST(req: Request) {
  const apiKey = process.env.SENDGRID_API_KEY
  const isEuResidency = process.env.SENDGRID_DATA_RESIDENCY === 'eu'
  if (!apiKey) {
    return NextResponse.json(
      { message: 'SENDGRID_API_KEY is not configured.' },
      { status: 500 },
    )
  }

  sgMail.setApiKey(apiKey)
  if (isEuResidency) {
    ;(
      sgMail as { setDataResidency?: (region: 'eu') => void }
    ).setDataResidency?.('eu')
  }

  let parsedBody: unknown
  try {
    parsedBody = await req.json()
  } catch (error) {
    console.error('[api/sendgrid] Invalid JSON body', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { message: 'Invalid JSON in request body.' },
      { status: 400 },
    )
  }

  const body =
    parsedBody &&
    typeof parsedBody === 'object' &&
    !Array.isArray(parsedBody)
      ? (parsedBody as {
          fullname?: unknown
          email?: unknown
          subject?: unknown
          message?: unknown
        })
      : {}

  const fullname = String(body.fullname ?? '').trim()
  const email = String(body.email ?? '').trim()
  const subject = String(body.subject ?? '').trim()
  const message = String(body.message ?? '').trim()

  if (!fullname || !email || !subject || !message) {
    return NextResponse.json(
      { message: 'fullname, email, subject, and message are required.' },
      { status: 400 },
    )
  }

  const to = process.env.CONTACT_TO_EMAIL ?? 'brandon@brandonperfetti.com'
  const from = process.env.CONTACT_FROM_EMAIL ?? 'info@brandonperfetti.com'

  try {
    await sgMail.send({
      to,
      from,
      replyTo: email,
      subject,
      html: `
        <h3>New contact from ${fullname}</h3>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong> ${message}</p>
      `,
    })

    return NextResponse.json({ message: 'Email sent successfully.' })
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Failed to send email.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

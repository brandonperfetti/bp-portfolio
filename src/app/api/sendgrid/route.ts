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

  const body = await req.json()

  if (!body?.fullname || !body?.email || !body?.subject || !body?.message) {
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
      replyTo: body.email,
      subject: body.subject,
      html: `
        <h3>New contact from ${body.fullname}</h3>
        <p><strong>Email:</strong> ${body.email}</p>
        <p><strong>Message:</strong> ${body.message}</p>
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

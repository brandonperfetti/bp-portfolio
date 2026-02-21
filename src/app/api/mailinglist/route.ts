import { NextResponse } from 'next/server'

interface SendGridError {
  message: string
  field?: string
  help?: string
}

export async function PUT(req: Request) {
  const apiKey = process.env.SENDGRID_API_KEY
  const listId = process.env.SENDGRID_MAILING_ID ?? process.env.SENDGRID_LIST_ID
  const isEuResidency = process.env.SENDGRID_DATA_RESIDENCY === 'eu'
  const apiBase = isEuResidency
    ? 'https://api.eu.sendgrid.com'
    : 'https://api.sendgrid.com'

  if (!apiKey || !listId) {
    return NextResponse.json(
      {
        message:
          'SendGrid mailing list environment variables are not configured.',
        error:
          'Expected SENDGRID_API_KEY and SENDGRID_MAILING_ID (or SENDGRID_LIST_ID).',
      },
      { status: 500 },
    )
  }

  const body = await req.json()
  const email = String(body?.mail ?? body?.email ?? '')
    .trim()
    .toLowerCase()

  if (!email) {
    return NextResponse.json({ message: 'Email is required.' }, { status: 400 })
  }

  try {
    const response = await fetch(`${apiBase}/v3/marketing/contacts`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contacts: [{ email }], list_ids: [listId] }),
    })

    const payload = await response.json()

    if (!response.ok || payload.errors) {
      return NextResponse.json(
        {
          message: 'Unable to subscribe right now. Please try again.',
          error: payload.errors
            ?.map((entry: SendGridError) =>
              [
                entry.message,
                entry.field ? `field: ${entry.field}` : '',
                entry.help,
              ]
                .filter(Boolean)
                .join(' | '),
            )
            .join(', '),
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      message: 'Your email has been added to the mailing list. Welcome.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Unable to subscribe right now. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

type Data = {
  message: string
  error?: string
}

interface SendGridError {
  message: string
  field?: string
  help?: string
}

// Export a named function corresponding to the HTTP method
export async function PUT(req: NextRequest) {
  if (req.method !== 'PUT') {
    return new NextResponse(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    const body = await req.json()
    const email = body.mail
    const url = `https://api.sendgrid.com/v3/marketing/contacts`

    const data = {
      contacts: [{ email: email }],
      list_ids: [process.env.SENDGRID_MAILING_ID],
    }

    const headers = {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    }

    const options = {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    }

    const response = await fetch(url, options)
    const json = await response.json()

    if (json.errors) {
      return new NextResponse(
        JSON.stringify({
          message:
            'Oops, there was a problem with your subscription. Please try again or contact us',
          error: json.errors
            .map((err: SendGridError) => err.message)
            .join(', '),
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
    }

    return new NextResponse(
      JSON.stringify({
        message:
          'Your email has been successfully added to the mailing list. Welcome 👋',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error) {
    console.error('SendGrid error:', error)
    return new NextResponse(
      JSON.stringify({
        message: 'Failed to process your request',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }
}

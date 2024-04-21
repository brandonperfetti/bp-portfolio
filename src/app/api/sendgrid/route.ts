import sgMail from '@sendgrid/mail'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '')

export async function POST(req: NextRequest, res: NextResponse) {
  if (req.method !== 'POST') {
    // Handle non-POST requests promptly
    return new NextResponse(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
  const body = await req.json()

  const emailContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Message from Sans Faux</title>
        <meta name="description" content="Message received from contact form" />
        <meta http-equiv="Content-Type" content="text/html charset=UTF-8" />
      </head>
      <body>
        <div class="container" style="margin: 20px; font-family: Arial, sans-serif;">
          <h3>New contact from ${body.fullname}</h3>
          <p><strong>Email Address:</strong> ${body.email}</p>
          <p><strong>Message:</strong> ${body.message}</p>
          <div style="margin-top: 20px;">
            <a href="https://sansfaux.com/" style="text-decoration: none; color: #FFFFFF; background-color: #3333CC; padding: 10px 20px; border-radius: 5px; display: inline-block;">Visit Our Website</a>
          </div>
        </div>
      </body>
    </html>`

  try {
    await sgMail.send({
      to: 'brandon@brandonperfetti.com',
      from: 'info@brandonperfetti.com',
      replyTo: `${body.email}`,
      subject: `${body.subject || 'BP Portfolio Form Submission'}`,
      html: emailContent,
    })
    return new NextResponse(
      JSON.stringify({ message: 'Email sent successfully.' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (error: any) {
    console.error('SendGrid error:', error)
    return new NextResponse(
      JSON.stringify({
        message: 'Failed to send email',
        error: error.toString(),
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

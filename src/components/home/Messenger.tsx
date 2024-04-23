'use client'
import Button from '@/components/common/Button'
import { MailIcon } from '@/icons'
import { useEffect, useState } from 'react'

interface Errors {
  fullname?: string
  email?: string
  subject?: string
  message?: string
}

export default function Messenger() {
  const [fullname, setFullname] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [buttonText, setButtonText] = useState('Send')
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const [botField, setBotField] = useState('') // Honeypot field

  useEffect(() => {
    if (!showSuccessMessage) return

    const timeout = setTimeout(() => {
      setShowSuccessMessage(false)
    }, 2000)

    return () => {
      clearTimeout(timeout)
    }
  }, [showSuccessMessage])

  const [showFailureMessage, setShowFailureMessage] = useState(false)

  const handleValidation = () => {
    let tempErrors: Errors = {}
    let isValid = true

    if (fullname.length <= 0) {
      tempErrors.fullname = 'Full name is required.'
      isValid = false
    }
    if (email.length <= 0) {
      tempErrors.email = 'Email address is required.'
      isValid = false
    }
    if (subject.length <= 0) {
      tempErrors.subject = 'Subject is required.'
      isValid = false
    }
    if (message.length <= 0) {
      tempErrors.message = 'Message is required.'
      isValid = false
    }

    setErrors(tempErrors)
    return isValid
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Check if the honeypot field is filled
    if (botField) {
      // console.log('Bot detected')
      return // Early return if botField is filled
    }

    let isValidForm = handleValidation()

    if (isValidForm) {
      setButtonText('Sending')
      const res = await fetch('/api/sendgrid', {
        body: JSON.stringify({
          email: email,
          fullname: fullname,
          subject: subject,
          message: message,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      const { error } = await res.json()
      if (error) {
        setShowSuccessMessage(false)
        setShowFailureMessage(true)
        setButtonText('Send')
        setFullname('')
        setEmail('')
        setMessage('')
        setSubject('')
        return
      }
      setShowSuccessMessage(true)
      setShowFailureMessage(false)
      setButtonText('Send')
      setFullname('')
      setEmail('')
      setMessage('')
      setSubject('')
    }
  }
  return (
    <form
      onSubmit={handleSubmit}
      action="/thank-you"
      className="rounded-2xl border border-zinc-100 p-6 dark:border-zinc-700/40"
    >
      {/* Honeypot field */}
      <div style={{ display: 'none' }}>
        <label htmlFor="botField">
          Don&apos;t fill this out if you&apos;re human:
        </label>
        <input
          id="botField"
          name="botField"
          type="text"
          value={botField}
          onChange={(e) => setBotField(e.target.value)}
        />
      </div>
      <h2 className="flex text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        <MailIcon className="h-6 w-6 flex-none" />
        <span className="ml-3">Send a message</span>
      </h2>
      <div className="mt-6">
        <div className="flex-row py-2">
          <input
            type="text"
            value={fullname}
            onChange={(e) => {
              setFullname(e.target.value)
            }}
            placeholder="Full Name"
            aria-label="Full Name"
            name="fullname"
            className="w-full min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
          />
          {errors?.fullname && (
            <p className="pt-3 text-sm text-red-500">{errors.fullname}</p>
          )}
        </div>
        <div className="flex-row py-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
            }}
            placeholder="Email Address"
            aria-label="Email Address"
            className="w-full min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
          />
          {errors?.email && (
            <p className="pt-3 text-sm text-red-500">{errors.email}</p>
          )}
        </div>
        <div>
          <div className="flex-row py-2">
            <input
              type="text"
              name="subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
              }}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
            />
            {errors?.subject && (
              <p className="pt-3 text-sm text-red-500">{errors.subject}</p>
            )}
          </div>
          <div className="flex-row py-2">
            <textarea
              name="message"
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
              }}
              placeholder="Message"
              aria-label="Message"
              className="w-full min-w-0 flex-auto appearance-none rounded-md border border-zinc-900/10 bg-white px-3 py-[calc(theme(spacing.2)-1px)] text-black shadow-md shadow-zinc-800/5 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-4 focus:ring-teal-500/10 sm:text-sm dark:border-zinc-700 dark:bg-zinc-700/[0.15] dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-teal-400 dark:focus:ring-teal-400/10"
            ></textarea>
            {errors?.message && (
              <p className="pb-2 pt-2 text-sm text-red-500">{errors.message}</p>
            )}
          </div>
          <Button fullWidth type="submit">
            {buttonText}
          </Button>
        </div>
        <div className="text-left">
          {showSuccessMessage && (
            <p className="my-2 text-sm font-semibold text-green-500">
              Thank you! Your Message has been delivered.
            </p>
          )}
          {showFailureMessage && (
            <p className="pt-2 text-sm text-red-500">
              Oops! Something went wrong, please try again.
            </p>
          )}
        </div>
      </div>
    </form>
  )
}

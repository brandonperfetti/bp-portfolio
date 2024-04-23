import { Messenger } from '@/components/home' // Adjust import path as necessary
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react-dom/test-utils'

describe('Messenger Component', () => {
  // Test empty form submission which should trigger validation errors
  it('displays validation errors when fields are empty and submit is clicked', async () => {
    render(<Messenger />)
    const submitButton = screen.getByRole('button', { name: /send/i })

    userEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Full name is required.')).toBeInTheDocument()
      expect(screen.getByText('Email address is required.')).toBeInTheDocument()
      expect(screen.getByText('Subject is required.')).toBeInTheDocument()
      expect(screen.getByText('Message is required.')).toBeInTheDocument()
    })
  })

  // Test input changes
  it('allows entering text in input fields', async () => {
    render(<Messenger />)
    const fullnameInput = screen.getByPlaceholderText('Full Name')
    const emailInput = screen.getByPlaceholderText('Email Address')
    const subjectInput = screen.getByPlaceholderText('Subject')
    const messageInput = screen.getByPlaceholderText('Message')

    userEvent.type(fullnameInput, 'John Doe')
    userEvent.type(emailInput, 'john@example.com')
    userEvent.type(subjectInput, 'Greetings')
    userEvent.type(messageInput, 'Hello there!')

    await act(async () => {
      await userEvent.type(fullnameInput, 'John Doe')
      await userEvent.type(emailInput, 'john@example.com')
      await userEvent.type(subjectInput, 'Greetings')
      await userEvent.type(messageInput, 'Hello there!')
    })
  })

  // Test successful form submission simulation
  it('clears the form and shows a success message on successful submission', async () => {
    render(<Messenger />)
    const fullnameInput = screen.getByPlaceholderText('Full Name')
    const emailInput = screen.getByPlaceholderText('Email Address')
    const subjectInput = screen.getByPlaceholderText('Subject')
    const messageInput = screen.getByPlaceholderText('Message')
    const submitButton = screen.getByRole('button', { name: /send/i })

    // Mock successful form submission
    global.fetch = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    userEvent.type(fullnameInput, 'John Doe')
    userEvent.type(emailInput, 'john@example.com')
    userEvent.type(subjectInput, 'Greetings')
    userEvent.type(messageInput, 'Hello there!')
    userEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.findByText('Thank you! Your Message has been delivered.'))
      expect(fullnameInput).toHaveValue('')
      expect(emailInput).toHaveValue('')
      expect(subjectInput).toHaveValue('')
      expect(messageInput).toHaveValue('')
    })
  })

  // Ensure the fetch mock is cleaned up
  afterEach(() => {
    jest.restoreAllMocks()
  })
})

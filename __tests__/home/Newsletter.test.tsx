import { Newsletter } from '@/components/home'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react-dom/test-utils'

describe('Newsletter Component', () => {
  beforeEach(() => {
    // Define fetch as a mock function
    global.fetch = jest.fn()

    // Default mock implementation to handle most cases
    ;(global.fetch as jest.Mock).mockImplementation((input, init) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: "You've subscribed successfully!",
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      ),
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('submits the form with valid email and shows success message', async () => {
    render(<Newsletter />)
    // Ensure the element is asserted as an HTMLInputElement
    const input = screen.getByPlaceholderText(
      'Email address',
    ) as HTMLInputElement
    const submitButton = screen.getByRole('button')

    // Fire events and await their effects within act
    await act(async () => {
      // Simulate typing into the input field
      userEvent.type(input, 'user@example.com')
      // Wait for state update if necessary
      await screen.findByDisplayValue('user@example.com')

      // Click the submit button
      userEvent.click(submitButton)
    })

    // Use waitFor to allow any asynchronous actions from the component to complete
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/mailinglist', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mail: 'user@example.com' }),
      })
      expect(
        screen.getByText("You've subscribed successfully!"),
      ).toBeInTheDocument()
      expect(input.value).toBe('') // Input should be cleared
    })
  })

  it('handles server errors and displays an error message', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Failed to subscribe.' }), {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(<Newsletter />)
    const input = screen.getByPlaceholderText('Email address')
    const submitButton = screen.getByRole('button')

    // Wrap interactions and assertions in act
    await act(async () => {
      await userEvent.type(input, 'user@example.com')
      userEvent.click(submitButton)
    })

    // Verify changes have been applied to the DOM
    await waitFor(() =>
      expect(screen.getByText('Failed to subscribe.')).toBeInTheDocument(),
    )
  })

  it('does not submit the form if the honeypot field is filled', async () => {
    render(<Newsletter />)
    const botInput = screen.getByLabelText(
      "Don't fill this out if you're human:",
    )
    const emailInput = screen.getByPlaceholderText('Email address')
    const submitButton = screen.getByRole('button')

    await act(async () => {
      userEvent.type(botInput, 'I am a robot')
      userEvent.type(emailInput, 'bot@example.com')
      userEvent.click(submitButton)
    })
    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })
})

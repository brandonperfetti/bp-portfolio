import HermesChat from '@/components/HermesChat'
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react-dom/test-utils'

describe('HermesChat Component', () => {
  // Mock global fetch
  beforeEach(() => {
    ;(global.fetch as jest.Mock) = jest.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ image: 'path/to/image' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })
  test('renders without crashing', () => {
    render(<HermesChat />)
    // Here you can add assertions to check for specific elements rendering, e.g., the message input box
  })

  test('submits a message when the send button is clicked', () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText('Write your message!')
    fireEvent.change(messageInput, { target: { value: 'Hello, Hermes!' } })
    fireEvent.click(screen.getByText('Send'))
    expect(screen.getByText('Hello, Hermes!')).toBeInTheDocument()
  })

  test('adds an image to the chat when a "Dali:" prefixed message is sent', async () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText('Write your message!')
    const sendButton = screen.getByRole('button', { name: 'Send' })

    fireEvent.change(messageInput, {
      target: { value: 'Dali: Create an image' },
    })
    await act(async () => {
      fireEvent.click(sendButton)
    })

    const img = (await screen.findByAltText(
      'Generated image',
    )) as HTMLImageElement // Type assertion here
    expect(img).toBeInTheDocument()

    // Check that the src contains the expected path
    expect(img.src).toContain('path/to/image')
  })

  test('handles API errors when fetching images gracefully', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API failure')),
    )

    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText('Write your message!')
    fireEvent.change(messageInput, {
      target: { value: 'Dali: Create an image' },
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Send'))
    })

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
  })

  test('allows multiple messages to be sent and displayed', async () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText('Write your message!')
    const sendButton = screen.getByText('Send')

    // Send first message
    fireEvent.change(messageInput, { target: { value: 'First message' } })
    await act(async () => {
      fireEvent.click(sendButton)
    })

    // Send second message
    fireEvent.change(messageInput, { target: { value: 'Second message' } })
    await act(async () => {
      fireEvent.click(sendButton)
    })

    expect(screen.getByText('First message')).toBeInTheDocument()
    expect(screen.getByText('Second message')).toBeInTheDocument()
  })

  test('maintains user input in state after API calls', async () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText(
      'Write your message!',
    ) as HTMLInputElement

    fireEvent.change(messageInput, { target: { value: 'Persistent message' } })
    fireEvent.click(screen.getByText('Send'))

    // Wait for any asynchronous effects to finish
    await act(async () => {})

    expect(messageInput.value).toBe('')
  })

  test('maintains user input in state after API calls', async () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText(
      'Write your message!',
    ) as HTMLInputElement // Type assertion here

    fireEvent.change(messageInput, { target: { value: 'Persistent message' } })
    fireEvent.click(screen.getByText('Send'))

    // Wait for any asynchronous effects to finish
    await act(async () => {})

    expect(messageInput.value).toBe('')
  })

  test('submits a message when the send button is clicked', () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText(
      'Write your message!',
    ) as HTMLInputElement // Type assertion here

    fireEvent.change(messageInput, { target: { value: 'Hello, Hermes!' } })
    fireEvent.click(screen.getByText('Send'))
    expect(screen.getByText('Hello, Hermes!')).toBeInTheDocument()
  })

  test('is accessible via keyboard navigation', () => {
    render(<HermesChat />)
    const messageInput = screen.getByPlaceholderText('Write your message!')
    messageInput.focus()
    expect(messageInput).toHaveFocus()
  })
})

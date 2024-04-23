import { Button } from '@/components/common' // Adjust the import path as necessary
import { ShortcutIcon } from '@/icons' // Adjust according to your actual icon imports
import { fireEvent, render, screen } from '@testing-library/react'

describe('Button Component', () => {
  // Test for basic rendering and variant changes
  it('renders correctly with different variants', () => {
    const { rerender } = render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toHaveClass(
      'bg-teal-500',
    )

    rerender(<Button variant="secondary">Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toHaveClass(
      'bg-gray-200',
    )

    rerender(
      <Button variant="danger" outline>
        Click me
      </Button>,
    )
    expect(screen.getByRole('button', { name: /click me/i })).toHaveClass(
      'border-red-500 text-red-500',
    )
  })

  // Test for the loading state
  it('displays a spinner when loading', () => {
    render(<Button loading>Click me</Button>)
    expect(screen.getByText(/click me/i)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByRole('button')).toContainElement(
      screen.getByTestId('spinner'),
    )
  })

  // Test for the disabled state
  it('is disabled when the disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button', { name: /disabled/i })).toBeDisabled()
  })

  // Test for handling click events
  it('handles onClick events', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    fireEvent.click(screen.getByText(/click me/i))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  // Test for correct icon rendering
  it('renders left and right icons correctly', () => {
    render(
      <Button leftIcon={<ShortcutIcon />} rightIcon={<ShortcutIcon />}>
        Click me
      </Button>,
    )
    expect(screen.getByText(/click me/i)).toBeInTheDocument()
    expect(screen.getAllByRole('img').length).toBe(2) // Assuming icons are rendered as img roles
  })
})

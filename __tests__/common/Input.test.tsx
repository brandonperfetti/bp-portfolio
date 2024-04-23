import { Input } from '@/components/common'
import { cleanup, render, screen } from '@testing-library/react'

describe('Input Component', () => {
  afterEach(() => {
    cleanup()
  })
  // Test rendering with default props
  it('renders an input with default props', () => {
    render(<Input placeholder="Enter text" />)
    const input = screen.getByPlaceholderText('Enter text')
    expect(input).toBeInTheDocument()
    expect(input).toHaveClass('border-gray-300')
  })

  // Test rendering with a danger variant
  it('renders with the danger variant', () => {
    render(<Input variant="danger" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-red-300', 'focus:border-red-500')
  })

  // Test disabled state
  it('is disabled when the disabled prop is set', () => {
    render(<Input disabled />)
    const input = screen.getByRole('textbox')
    expect(input).toBeDisabled()
    expect(input).toHaveClass('cursor-not-allowed', 'bg-gray-50')
  })

  // Test readOnly state
  it('is read-only when the readOnly prop is set', () => {
    render(<Input readOnly />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('readOnly')
    expect(input).toHaveClass('cursor-default', 'bg-gray-50')
  })

  // Test loading state shows spinner
  it('shows a spinner when loading', () => {
    render(<Input loading />)
    const spinner = screen.getByTestId('spinner') // Ensure your Spinner component has a 'data-testid' attribute
    expect(spinner).toBeInTheDocument()
  })

  // Test with left and right icons
  it('displays left and right icons if provided', () => {
    const leftIcon = <span data-testid="left-icon">LeftIcon</span>
    const rightIcon = <span data-testid="right-icon">RightIcon</span>
    render(<Input leftIcon={leftIcon} rightIcon={rightIcon} />)

    const leftIconElement = screen.getByTestId('left-icon')
    const rightIconElement = screen.getByTestId('right-icon')
    expect(leftIconElement).toBeInTheDocument()
    expect(rightIconElement).toBeInTheDocument()
  })

  // Test for different sizes
  describe('Input Component size variations', () => {
    it('applies correct padding for size "xs"', () => {
      // @ts-ignore
      render(<Input size="xs" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('p-2')
    })

    it('applies correct padding for size "2xl"', () => {
      // @ts-ignore
      render(<Input size="2xl" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('p-3')
    })
  })

  // Test full width
  it('renders full width when fullWidth prop is set', () => {
    render(<Input fullWidth />)
    const container = screen.getByRole('textbox').parentNode
    expect(container).toHaveClass('w-full')
  })
})

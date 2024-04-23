import { SimpleLayout } from '@/components/common' // Adjust the import path as necessary
import { render, screen } from '@testing-library/react'

describe('SimpleLayout Component', () => {
  const title = 'Test Title'
  const intro = 'This is the intro text.'

  it('renders the title and intro', () => {
    render(<SimpleLayout title={title} intro={intro} />)

    const titleElement = screen.getByRole('heading', { name: title })
    const introElement = screen.getByText(intro)

    expect(titleElement).toBeInTheDocument()
    expect(introElement).toBeInTheDocument()
  })

  it('renders children when provided', () => {
    const childText = 'Child content'

    render(
      <SimpleLayout title={title} intro={intro}>
        <div>{childText}</div>
      </SimpleLayout>,
    )

    const childElement = screen.getByText(childText)
    expect(childElement).toBeInTheDocument()
  })

  it('does not render the children section when no children are provided', () => {
    const { queryByTestId } = render(
      <SimpleLayout title={title} intro={intro} />,
    )
    expect(queryByTestId('children-container')).toBeNull()
  })

  it('applies the correct classes to the container', () => {
    render(<SimpleLayout title={title} intro={intro} />)

    const headerElement = screen.getByRole('banner')
    expect(headerElement).toHaveClass('max-w-2xl')
    expect(headerElement.querySelector('h1')).toHaveClass(
      'text-4xl',
      'font-bold',
      'tracking-tight',
      'text-zinc-800',
      'sm:text-5xl',
      'dark:text-zinc-100',
    )
    expect(headerElement.querySelector('p')).toHaveClass(
      'mt-6',
      'text-base',
      'text-zinc-600',
      'dark:text-zinc-400',
    )
  })
})

import { Card } from '@/components/common' // Adjust the import path as necessary
import { render, screen } from '@testing-library/react'

describe('Card Component', () => {
  // Test basic rendering of the card
  it('renders the Card with given children', () => {
    render(
      <Card>
        <Card.Title>Test Title</Card.Title>
        <Card.Description>Description here</Card.Description>
        <Card.Cta>Learn More</Card.Cta>
      </Card>,
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Description here')).toBeInTheDocument()
    expect(screen.getByText('Learn More')).toBeInTheDocument()
  })

  // Test for correct rendering of Card.Title with a link
  it('renders Card.Title with a link if href is provided', () => {
    render(
      <Card>
        <Card.Title href="/test-link">Clickable Title</Card.Title>
      </Card>,
    )
    const title = screen.getByText('Clickable Title')
    expect(title.closest('a')).toHaveAttribute('href', '/test-link')
  })

  // Test for Card.Description ensuring text and style
  it('renders Card.Description correctly', () => {
    render(
      <Card>
        <Card.Description>Description text</Card.Description>
      </Card>,
    )
    expect(screen.getByText('Description text')).toHaveClass(
      'text-sm text-zinc-600 dark:text-zinc-400',
    )
  })

  // Test Card.Cta to include the ChevronRightIcon
  it('renders Card.Cta with ChevronRightIcon', () => {
    render(
      <Card>
        <Card.Cta>See more</Card.Cta>
      </Card>,
    )
    expect(screen.getByText('See more')).toBeInTheDocument()
    // Check for SVG element directly since it is aria-hidden
    const svgIcons = document.querySelectorAll('svg')
    expect(svgIcons.length).toBeGreaterThan(0) // Ensure there's at least one SVG element rendered
  })

  // Test for Card.Eyebrow with decoration
  it('renders Card.Eyebrow with decoration if decorate is true', () => {
    const { container } = render(
      <Card>
        <Card.Eyebrow decorate={true}>Eyebrow Text</Card.Eyebrow>
      </Card>,
    )

    console.log(container.innerHTML) // Outputs the rendered HTML to help debugging

    const eyebrowText = screen.getByText('Eyebrow Text')
    expect(eyebrowText).toBeInTheDocument() // Check if the eyebrow text is in the document

    // Query directly for the decorative span using a more specific query if possible
    const decorationSpan = container.querySelector(
      'span.bg-zinc-200, span.bg-zinc-500',
    )
    expect(decorationSpan).toBeInTheDocument() // Check if the decoration span is in the document
  })
})

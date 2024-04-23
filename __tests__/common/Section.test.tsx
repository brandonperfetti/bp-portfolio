import { Section } from '@/components/common' // Adjust the import path as necessary
import { render, screen } from '@testing-library/react'

describe('Section Component', () => {
  it('renders the section with the correct title and content', () => {
    const titleText = 'Test Title'
    const contentText = 'Test content goes here'

    render(
      <Section title={titleText}>
        <p>{contentText}</p>
      </Section>,
    )

    // Check if the title is rendered correctly
    const title = screen.getByText(titleText)
    expect(title).toBeInTheDocument()
    expect(title.tagName).toBe('H2')

    // Check if the content is rendered correctly
    const content = screen.getByText(contentText)
    expect(content).toBeInTheDocument()
    expect(content.tagName).toBe('P')
  })

  it('associates the section with the title using aria-labelledby', () => {
    const titleText = 'Accessibility Test Title'

    const { container } = render(
      <Section title={titleText}>
        <p>Accessibility content</p>
      </Section>,
    )

    const title = screen.getByText(titleText)
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('aria-labelledby', title.id)
  })

  it('ensures unique ID handling for multiple sections', () => {
    render(
      <>
        <Section title="First Section">
          <p>Content for the first section</p>
        </Section>
        <Section title="Second Section">
          <p>Content for the second section</p>
        </Section>
      </>,
    )

    const firstSectionTitle = screen.getByText('First Section')
    const secondSectionTitle = screen.getByText('Second Section')

    const firstSection = screen.getByLabelText('First Section')
    const secondSection = screen.getByLabelText('Second Section')

    expect(firstSection).toHaveAttribute(
      'aria-labelledby',
      firstSectionTitle.id,
    )
    expect(secondSection).toHaveAttribute(
      'aria-labelledby',
      secondSectionTitle.id,
    )

    // Ensure the IDs are unique
    expect(firstSectionTitle.id).not.toBe(secondSectionTitle.id)
  })
})

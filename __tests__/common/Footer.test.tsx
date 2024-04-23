import { Footer } from '@/components/common'
import { render, screen } from '@testing-library/react'

describe('Footer Component', () => {
  // Test to check if the Footer renders correctly
  it('renders the Footer with all navigation links and copyright information', () => {
    render(<Footer />)

    // Check for navigation links
    const aboutLink = screen.getByRole('link', { name: /about/i })
    expect(aboutLink).toHaveAttribute('href', '/about')

    const articlesLink = screen.getByRole('link', { name: /articles/i })
    expect(articlesLink).toHaveAttribute('href', '/articles')

    const projectsLink = screen.getByRole('link', { name: /projects/i })
    expect(projectsLink).toHaveAttribute('href', '/projects')

    const techLink = screen.getByRole('link', { name: /tech/i })
    expect(techLink).toHaveAttribute('href', '/tech')

    const usesLink = screen.getByRole('link', { name: /uses/i })
    expect(usesLink).toHaveAttribute('href', '/uses')

    // Check for the copyright text
    const currentYear = new Date().getFullYear()
    const copyrightText = screen.getByText(
      `© ${currentYear} Brandon Perfetti. All rights reserved.`,
      { exact: false },
    )
    expect(copyrightText).toBeInTheDocument()
  })
})

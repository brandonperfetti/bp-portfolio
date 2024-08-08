import { Resume } from '@/components/home'
import { render, screen, within } from '@testing-library/react'

describe('Resume Component', () => {
  // Test for basic rendering and content verification
  test('renders correctly and displays roles', () => {
    render(<Resume />)

    // Check for the main section heading
    expect(screen.getByText('Work')).toBeInTheDocument()

    // Verify the roles are displayed
    const roles = screen.getAllByRole('listitem')
    expect(roles.length).toBe(6) // Should have 6 roles

    // Check for multiple occurrences of the same job title
    const titles = screen.getAllByText('Technical PM + Software Engineer')
    expect(titles.length).toBeGreaterThanOrEqual(2) // Check there are at least two roles with the same title

    // For a specific role check, access roles by index and then perform checks
    const firstRoleTitle = within(roles[0]).getByText(
      'Technical PM + Software Engineer',
    )
    expect(firstRoleTitle).toBeInTheDocument()

    // Check images in roles, specifically for alt text since it's empty and we're using src to identify
    const images = screen.getAllByRole('img', { name: '' })
    expect(images[0]).toHaveAttribute(
      'src',
      'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1713562733/bp-portfolio/images/logos/rocket-7757105_640_lcepwk_vd862c.png',
    )
    expect(images[0]).toHaveAttribute('height', '100')
    expect(images[0]).toHaveAttribute('width', '100')
  })

  // Test for the download button
  test('renders a download button for the CV', () => {
    render(<Resume />)
    const downloadButton = screen.getByRole('link', { name: 'Download CV' })
    expect(downloadButton).toBeInTheDocument()
    expect(downloadButton).toHaveAttribute(
      'href',
      'assets/Brandon_Perfetti_CV.pdf',
    )
  })
})

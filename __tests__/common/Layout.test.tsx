import Layout from '@/components/common/Layout'
import { render, screen } from '@testing-library/react'

describe('Layout Component', () => {
  it('renders the header, main content, and footer', () => {
    render(
      <Layout>
        <div>Test Content</div>
      </Layout>,
    )

    // Check if the main content is rendered
    const mainContent = screen.getByText('Test Content')
    expect(mainContent).toBeInTheDocument()
    expect(mainContent.tagName).toBe('DIV')

    // Assuming Header and Footer have unique text or roles that can be identified
    expect(screen.getByTestId('header')).toBeInTheDocument() // Assuming 'Header' uses this role
    expect(screen.getByTestId('footer')).toBeInTheDocument() // Assuming 'Footer' uses this role
  })
})

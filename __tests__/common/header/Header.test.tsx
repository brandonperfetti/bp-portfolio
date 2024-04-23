import { Header } from '@/components/common/header'
import { render, screen } from '@testing-library/react'

describe('Header Component', () => {
  // Ensure tests cleanup properly after each test
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders correctly on the home page', () => {
    render(<Header />)
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('avatar')).toBeInTheDocument()
    expect(screen.queryByText('Menu')).toBeInTheDocument()
    expect(screen.queryByText('About')).toBeInTheDocument()
    expect(screen.queryByText('Articles')).toBeInTheDocument()
    expect(screen.queryByText('Projects')).toBeInTheDocument()
    expect(screen.queryByText('Tech')).toBeInTheDocument()
    expect(screen.queryByText('Uses')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Toggle dark mode' }),
    ).toBeInTheDocument() // Mode toggle button
    expect(screen.getByTestId('header-jumper')).toBeInTheDocument()
  })
})

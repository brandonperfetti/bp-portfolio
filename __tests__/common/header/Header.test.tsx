import { Header } from '@/components/common/header'
import { render, screen } from '@testing-library/react'

describe('Header Component', () => {
  it('renders correctly on the home page', () => {
    render(<Header />)
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.queryByText('Menu')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Toggle dark mode' }),
    ).toBeInTheDocument() // Mode toggle button
  })
})

import { Container } from '@/components/common/Container'
import { render, screen } from '@testing-library/react'

describe('Container Components', () => {
  // Test basic rendering of the Container component
  it('renders the nested structure correctly', () => {
    render(<Container>Content</Container>)

    const contentElement = screen.getByText('Content')
    expect(contentElement).toBeInTheDocument()

    // The direct parent of the content should be the innermost div with 'mx-auto max-w-2xl lg:max-w-5xl'
    const innerMostContainer = contentElement.parentNode
    expect(innerMostContainer).toHaveClass(' relative px-4 sm:px-8 lg:px-12') // This checks the direct parent div

    // The parent of this should have 'relative px-4 sm:px-8 lg:px-12'
    const innerContainer = innerMostContainer?.parentNode
    expect(innerContainer).toHaveClass('mx-auto w-full max-w-7xl lg:px-8')

    // The parent of innerContainer should be the div inside ContainerOuter, which has 'mx-auto w-full max-w-7xl lg:px-8'
    const outerInnerContainer = innerContainer?.parentNode
    expect(outerInnerContainer).toHaveClass('sm:px-8')
  })

  // Test that additional classNames are applied correctly
  it('applies additional classNames to ContainerOuter and ContainerInner', () => {
    render(
      <Container className="additional-class">
        <div>More Content</div>
      </Container>,
    )
    // Check for additional class on the outer container
    expect(screen.getByText('More Content').parentNode?.parentNode).toHaveClass(
      'relative px-4 sm:px-8 lg:px-12',
    )
    // Can also check for correct propagation of other props if necessary
  })

  // Test ref forwarding in ContainerOuter and ContainerInner
  it('forwards refs correctly', () => {
    const ref = { current: null }
    render(
      <Container ref={ref}>
        <div>Check Ref</div>
      </Container>,
    )
    // Here we're assuming that the ContainerOuter's div should get the ref
    expect(ref.current).toContainElement(screen.getByText('Check Ref'))
  })
})

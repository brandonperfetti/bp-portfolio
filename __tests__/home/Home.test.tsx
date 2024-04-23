import { Home } from '@/components/home'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Mock data for articles
const mockArticles = [
  {
    slug: 'test-article-1',
    title: 'Test Article 1',
    date: '2022-01-01',
    description: 'Description 1',
    author: {
      href: '#',
      name: 'Author One',
      role: 'Journalist',
      image: 'author1.jpg',
    },
    category: {
      href: '#',
      title: 'Category One',
    },
    image: 'image1.jpg',
  },
  {
    slug: 'test-article-2',
    title: 'Test Article 2',
    date: '2022-01-02',
    description: 'Description 2',
    author: {
      href: '#',
      name: 'Author Two',
      role: 'Columnist',
      image: 'author2.jpg',
    },
    category: {
      href: '#',
      title: 'Category Two',
    },
    image: 'image2.jpg',
  },
]

describe('Home Component', () => {
  test('renders without crashing', () => {
    render(<Home articles={mockArticles} />)
    expect(
      screen.getByText(
        'Seasoned Product & Project Manager, Software Engineer, and Continuous Learner.',
      ),
    ).toBeInTheDocument()
  })

  test('displays articles when provided', () => {
    render(<Home articles={mockArticles} />)
    expect(screen.getByText('Test Article 1')).toBeInTheDocument()
    expect(screen.getByText('Test Article 2')).toBeInTheDocument()
  })

  test('displays no articles message when no articles are provided', () => {
    render(<Home articles={[]} />)
    expect(screen.getByText('No articles to display.')).toBeInTheDocument()
  })
})

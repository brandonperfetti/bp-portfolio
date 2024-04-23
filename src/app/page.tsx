import { Home } from '@/components/home'
import { getAllArticles } from '@/lib/articles'

async function HomePage() {
  let articles = (await getAllArticles()).slice(0, 7)
  return <Home articles={articles} />
}

export default HomePage

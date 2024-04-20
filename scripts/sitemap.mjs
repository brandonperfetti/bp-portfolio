import { writeFile } from 'fs/promises'
import { globby } from 'globby'

const PAGE = 'https://brandonperfetti.com'

const createPath = (p) => {
  // Remove the initial directory structure and file extension
  let path = p.replace('src/app/', '').replace(/\/page\.(tsx|mdx)$/, '')

  // Convert paths to URL format
  path = '/' + path.replace(/\\/g, '/') // Ensure all paths use forward slashes
  if (path.endsWith('/') && path.length > 1) {
    path = path.substring(0, path.length - 1)
  }
  return path
}

const collectPaths = async () => {
  const paths = await globby(['**/*page.tsx', '**/*page.mdx'], {
    cwd: 'src/app',
  })
  // console.log('Collected paths:', paths) // Log collected paths for debugging
  return paths.map(createPath)
}

const createSitemap = async (routes) => {
  return `
  <?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${routes
        .map((route) => {
          return `
            <url>
                <loc>${`${PAGE}${route}`}</loc>
            </url>
          `
        })
        .join('')}
  </urlset>
  `
}

;(async () => {
  try {
    const paths = await collectPaths()
    const sitemap = await createSitemap(paths)
    await writeFile('./public/sitemap.xml', sitemap, { encoding: 'utf-8' })
  } catch (error) {
    console.error('Failed to generate sitemap:', error)
    process.exit(1) // Exit with an error code to indicate failure in a CI/CD pipeline
  }
})()

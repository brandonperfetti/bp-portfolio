import type { MetadataRoute } from 'next'

/**
 * Web app manifest, served at `/manifest.webmanifest` and auto-linked by
 * Next's metadata-file convention.
 *
 * @remarks
 * Exists so add-to-home-screen installs show Brandon's headshot instead of a
 * lettermark tile. Android/Chrome reads `icons` from here — including the
 * `maskable` variants, which pad the subject into the 80%-diameter safe zone
 * so it survives the circular/squircle crops launchers apply. iOS ignores
 * manifest icons entirely and uses the `apple-touch-icon` declared in the
 * root layout metadata instead. `display: 'minimal-ui'` keeps lightweight
 * browser controls when launched from a home screen — this is a content
 * site, not an app shell, and readers still need URL/share affordances.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Brandon Perfetti',
    short_name: 'Brandon',
    description:
      'Senior Frontend & Full-Stack Engineer — articles, projects, and the Corvus AI assistant.',
    start_url: '/',
    display: 'minimal-ui',
    background_color: '#fafafa',
    theme_color: '#fafafa',
    icons: [
      {
        src: '/assets/favicons/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/assets/favicons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/assets/favicons/maskable-icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/assets/favicons/maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}

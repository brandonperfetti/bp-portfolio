const DEFAULT_SITE_URL = 'https://brandonperfetti.com'
export const SITE_DESCRIPTION =
  'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.'
export const DEFAULT_SOCIAL_IMAGE =
  'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1684298666/image-1_ebktnx.jpg'

export function getSiteUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL
  return siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
}

type CloudinaryCropMode = 'fill' | 'fit' | 'scale'

type CloudinaryOptions = {
  width?: number
  height?: number
  crop?: CloudinaryCropMode
}

function isVersionSegment(segment: string) {
  return /^v\d+$/.test(segment)
}

function isTransformSegment(segment: string) {
  if (!segment) {
    return false
  }

  if (segment.startsWith('t_')) {
    return true
  }

  if (segment.includes(':')) {
    return true
  }

  const components = segment.split(',')
  return components.some((component) => /^[a-z]{1,6}_[^/]+$/i.test(component))
}

function withCloudinaryTransform(url: string, transform: string) {
  try {
    const parsed = new URL(url)
    const marker = '/upload/'
    const markerIndex = parsed.pathname.indexOf(marker)

    if (markerIndex === -1) {
      return url
    }

    const prefix = parsed.pathname.slice(0, markerIndex + marker.length)
    const suffix = parsed.pathname.slice(markerIndex + marker.length)
    const segments = suffix.split('/').filter(Boolean)
    const firstNonVersionSegment = segments.find(
      (segment) => !isVersionSegment(segment),
    )

    if (firstNonVersionSegment && isTransformSegment(firstNonVersionSegment)) {
      return url
    }

    parsed.pathname = `${prefix}${transform}/${suffix}`
    return parsed.toString()
  } catch {
    return url
  }
}

export function getOptimizedImageUrl(url: string, options: CloudinaryOptions = {}) {
  if (!url.startsWith('https://res.cloudinary.com/')) {
    return url
  }

  const parts = ['f_auto', 'q_auto', 'dpr_auto']
  const crop = options.crop ?? 'fill'

  if (options.width) {
    parts.push(`w_${Math.max(1, Math.round(options.width))}`)
  }

  if (options.height) {
    parts.push(`h_${Math.max(1, Math.round(options.height))}`)
  }

  if (options.width || options.height) {
    parts.push(`c_${crop}`)
  }

  return withCloudinaryTransform(url, parts.join(','))
}

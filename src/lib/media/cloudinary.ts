import { createHash } from 'node:crypto'

type CloudinaryConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
  folder: string
  techLogosFolder: string
}

const CLOUDINARY_UPLOAD_TIMEOUT_MS = 15_000

function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  const folder = process.env.CLOUDINARY_CMS_COVERS_FOLDER?.trim()
  const techLogosFolder = process.env.CLOUDINARY_CMS_TECH_LOGOS_FOLDER?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    return null
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: folder || 'bp-portfolio/articles',
    techLogosFolder: techLogosFolder || 'bp-portfolio/tech',
  }
}

function buildSignature(
  config: CloudinaryConfig,
  params: Record<string, string>,
) {
  const signaturePairs = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
  const raw = `${signaturePairs.join('&')}${config.apiSecret}`
  return createHash('sha1').update(raw).digest('hex')
}

export async function uploadBase64PngToCloudinary(options: {
  base64Png: string
  publicId: string
}): Promise<{ url: string }> {
  const config = getCloudinaryConfig()
  if (!config) {
    throw new Error(
      'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
    )
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildSignature(config, {
    folder: config.folder,
    public_id: options.publicId,
    timestamp: String(timestamp),
  })
  const formData = new FormData()
  formData.append('file', `data:image/png;base64,${options.base64Png}`)
  formData.append('api_key', config.apiKey)
  formData.append('timestamp', String(timestamp))
  formData.append('public_id', options.publicId)
  formData.append('signature', signature)
  formData.append('folder', config.folder)

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    CLOUDINARY_UPLOAD_TIMEOUT_MS,
  )
  let response: Response
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      },
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Cloudinary upload timed out after ${CLOUDINARY_UPLOAD_TIMEOUT_MS}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const body = (await response.json().catch(() => null)) as {
    secure_url?: string
    error?: { message?: string }
  } | null

  if (!response.ok || !body?.secure_url) {
    throw new Error(
      body?.error?.message ||
        `Cloudinary upload failed with status ${response.status}`,
    )
  }

  return { url: body.secure_url }
}

export async function uploadRemoteImageToCloudinary(options: {
  imageUrl: string
  publicId: string
}): Promise<{ url: string }> {
  const config = getCloudinaryConfig()
  if (!config) {
    throw new Error(
      'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET)',
    )
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = buildSignature(config, {
    folder: config.techLogosFolder,
    overwrite: 'true',
    public_id: options.publicId,
    timestamp: String(timestamp),
  })

  const formData = new FormData()
  formData.append('file', options.imageUrl)
  formData.append('api_key', config.apiKey)
  formData.append('timestamp', String(timestamp))
  formData.append('public_id', options.publicId)
  formData.append('signature', signature)
  formData.append('folder', config.techLogosFolder)
  formData.append('overwrite', 'true')

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    CLOUDINARY_UPLOAD_TIMEOUT_MS,
  )
  let response: Response
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      },
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Cloudinary upload timed out after ${CLOUDINARY_UPLOAD_TIMEOUT_MS}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const body = (await response.json().catch(() => null)) as {
    secure_url?: string
    error?: { message?: string }
  } | null

  if (!response.ok || !body?.secure_url) {
    throw new Error(
      body?.error?.message ||
        `Cloudinary upload failed with status ${response.status}`,
    )
  }

  return { url: body.secure_url }
}

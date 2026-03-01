import { createHash } from 'node:crypto'

type CloudinaryConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
  folder: string
}

function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  const folder = process.env.CLOUDINARY_CMS_COVERS_FOLDER?.trim()

  if (!cloudName || !apiKey || !apiSecret) {
    return null
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder: folder || 'bp-portfolio/articles',
  }
}

function buildSignature(
  config: CloudinaryConfig,
  timestamp: number,
  publicId: string,
) {
  const signaturePairs = [`public_id=${publicId}`, `timestamp=${timestamp}`]
  signaturePairs.unshift(`folder=${config.folder}`)
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
  const signature = buildSignature(config, timestamp, options.publicId)
  const formData = new FormData()
  formData.append('file', `data:image/png;base64,${options.base64Png}`)
  formData.append('api_key', config.apiKey)
  formData.append('timestamp', String(timestamp))
  formData.append('public_id', options.publicId)
  formData.append('signature', signature)
  formData.append('folder', config.folder)

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    },
  )

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
